import type { Tweet } from "agent-twitter-client";
import {
    // getEmbeddingZeroVector,
    ModelClass,
    type TemplateType,
    type UUID,
} from "./types";
import { Logger } from "@hiveai/utils";
import type { ClientBase } from "./base.ts";
import { type IImageDescriptionService, ServiceType } from "./types";
import { cleanJsonResponse, extractAttributes, parseJSONObjectFromText, truncateToCompleteSentence, buildConversationThread, fetchMediaData, stringToUuid } from "./utils";
import { twitterMessageHandlerTemplate } from "./interactions";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment";
import type { State } from "./types";
import type { ActionResponse } from "./types";
import { MediaData } from "./types";
import { EventEmitter } from 'events';
import { SearchMode } from 'agent-twitter-client';

const MAX_TIMELINES_TO_FETCH = 15;


export const postActionResponseFooter = `Choose any combination of [LIKE], [RETWEET], [QUOTE], and [REPLY] that are appropriate. Each action must be on its own line. Your response must only include the chosen actions.`;


const twitterPostTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

# Task: Generate a post in the voice and style and perspective of {{agentName}} @{{twitterUserName}}.
Write a post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Do not add commentary or acknowledge this request, just write the post.
Your response should be 1, 2, or 3 sentences (choose the length at random).
Your response should not contain any questions. Brief, concise statements only. The total character count MUST be less than {{maxTweetLength}}. No emojis. Use \\n\\n (double spaces) between statements if there are multiple statements in your response.`;

export const twitterActionTemplate =
    `
# INSTRUCTIONS: Determine actions for {{agentName}} (@{{twitterUserName}}) based on:
{{bio}}
{{postDirections}}

Guidelines:
- ONLY engage with content that DIRECTLY relates to character's core interests
- Direct mentions are priority IF they are on-topic
- Skip ALL content that is:
  - Off-topic or tangentially related
  - From high-profile accounts unless explicitly relevant
  - Generic/viral content without specific relevance
  - Political/controversial unless central to character
  - Promotional/marketing unless directly relevant

Actions (respond only with tags):
[LIKE] - Perfect topic match AND aligns with character (9.8/10)
[RETWEET] - Exceptional content that embodies character's expertise (9.5/10)
[QUOTE] - Can add substantial domain expertise (9.5/10)
[REPLY] - Can contribute meaningful, expert-level insight (9.5/10)

Tweet:
{{currentTweet}}

# Respond with qualifying action tags only. Default to NO action unless extremely confident of relevance.` +
    postActionResponseFooter;

interface PendingTweet {
    tweetTextForPosting: string;
    roomId: UUID;
    rawTweetContent: string;
    discordMessageId: string;
    channelId: string;
    timestamp: number;
}

type PendingTweetApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export class TwitterPostClient extends EventEmitter {
    client: ClientBase;
    runtime: any;
    twitterUsername: string;
    private isProcessing = false;
    private lastProcessTime = 0;
    private stopProcessingActions = false;
    private isDryRun: boolean;

    private approvalRequired = false;
    private approvalCheckInterval: number | undefined;

    constructor(client: ClientBase, runtime: any) {
        super();
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = client.twitterConfig.TWITTER_USERNAME;
        this.isDryRun = client.twitterConfig.TWITTER_DRY_RUN;

        // Log configuration on initialization
        Logger.log("Twitter Client Configuration:");
        Logger.log(`- Username: ${this.twitterUsername}`);
        Logger.log(
            `- Dry Run Mode: ${this.isDryRun ? "enabled" : "disabled"}`
        );
        Logger.log(
            `- Post Interval: ${this.client.twitterConfig.POST_INTERVAL_MIN}-${this.client.twitterConfig.POST_INTERVAL_MAX} minutes`
        );
        Logger.log(
            `- Action Processing: ${
                this.client.twitterConfig.ENABLE_ACTION_PROCESSING
                    ? "enabled"
                    : "disabled"
            }`
        );
        Logger.log(
            `- Action Interval: ${this.client.twitterConfig.ACTION_INTERVAL} minutes`
        );
        Logger.log(
            `- Post Immediately: ${
                this.client.twitterConfig.POST_IMMEDIATELY
                    ? "enabled"
                    : "disabled"
            }`
        );
        Logger.log(
            `- Search Enabled: ${
                this.client.twitterConfig.TWITTER_SEARCH_ENABLE
                    ? "enabled"
                    : "disabled"
            }`
        );

        const targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
        if (targetUsers) {
            Logger.log(`- Target Users: ${targetUsers}`);
        }

        if (this.isDryRun) {
            Logger.log(
                "Twitter client initialized in dry run mode - no actual tweets should be posted"
            );
        }

        // Initialize Discord webhook
        const approvalRequired: boolean =
            this.runtime
                .getSetting("TWITTER_APPROVAL_ENABLED")
                ?.toLocaleLowerCase() === "true";
        if (approvalRequired) {

            const APPROVAL_CHECK_INTERVAL =
                Number.parseInt(
                    this.runtime.getSetting("TWITTER_APPROVAL_CHECK_INTERVAL") ||
                        "5"
                ) * 60 * 1000; // 5 minutes

            this.approvalCheckInterval = APPROVAL_CHECK_INTERVAL;
            this.approvalRequired = true;
        }
    }
 

    async start() {
        if (!this.client.profile) {
            await this.client.init();
        }

        // Start monitoring for mentions and replies
        this.startMonitoring();
    }

    private async startMonitoring() {
        const checkInterval = this.client.twitterConfig.TWITTER_POLL_INTERVAL * 1000;
        
        const monitorLoop = async () => {
            try {
                const mentions = await this.client.fetchSearchTweets(
                    `@${this.twitterUsername}`,
                    20,
                    SearchMode.Latest
                );

                for (const mention of mentions.tweets) {
                    if (mention.username !== this.twitterUsername) {
                        this.emit('mention', mention);
                    }
                }

                const timeline = await this.client.fetchHomeTimeline(20);
                for (const tweet of timeline) {
                    if (tweet.inReplyToStatusId && tweet.username !== this.twitterUsername) {
                        this.emit('reply', tweet);
                    }
                }
            } catch (error) {
                Logger.error('Error monitoring Twitter:', error);
            }

            setTimeout(monitorLoop, checkInterval);
        };

        monitorLoop();
    }

    private runPendingTweetCheckLoop() {
        setInterval(async () => {
            await this.handlePendingTweet();
        }, this.approvalCheckInterval);
    }

    createTweetObject(
        tweetResult: any,
        client: any,
        twitterUsername: string
    ): Tweet {
        return {
            id: tweetResult.rest_id,
            name: client.profile.screenName,
            username: client.profile.username,
            text: tweetResult.legacy.full_text,
            conversationId: tweetResult.legacy.conversation_id_str,
            createdAt: tweetResult.legacy.created_at,
            timestamp: new Date(tweetResult.legacy.created_at).getTime(),
            userId: client.profile.id,
            inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
            permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
            hashtags: [],
            mentions: [],
            photos: [],
            thread: [],
            urls: [],
            videos: [],
        } as Tweet;
    }

    async processAndCacheTweet(
        runtime: any,
        client: ClientBase,
        tweet: Tweet,
        roomId: UUID,
        rawTweetContent: string
    ) {
        // Cache the last post details
        await runtime.cacheManager.set(
            `twitter/${client.profile?.username || ""}/lastPost`,
            {
                id: tweet.id,
                timestamp: Date.now(),
            }
        );

        // Cache the tweet
        await client.cacheTweet(tweet);

        // Log the posted tweet
        Logger.log(`Tweet posted:\n ${tweet.permanentUrl}`);

        // Ensure the room and participant exist
        await runtime.ensureRoomExists(roomId);
        await runtime.ensureParticipantInRoom(runtime.agentId, roomId);

        // // Create a memory for the tweet
        // await runtime.messageManager.createMemory({
        //     id: stringToUuid(tweet.id + "-" + runtime.agentId),
        //     userId: runtime.agentId,
        //     agentId: runtime.agentId,
        //     content: {
        //         text: rawTweetContent.trim(),
        //         url: tweet.permanentUrl,
        //         source: "twitter",
        //     },
        //     roomId,
        //     embedding: getEmbeddingZeroVector(),
        //     createdAt: tweet.timestamp,
        // });
    }

    async handleNoteTweet(
        client: ClientBase,
        content: string,
        tweetId?: string,
        mediaData?: MediaData[]
    ) {
        try {
            const noteTweetResult = await client.requestQueue.add(
                async () =>
                    await client.twitterClient.sendNoteTweet(
                        content,
                        tweetId,
                        mediaData
                    )
            );

            if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
                // Note Tweet failed due to authorization. Falling back to standard Tweet.
                const truncateContent = truncateToCompleteSentence(
                    content,
                    this.client.twitterConfig.MAX_TWEET_LENGTH
                );
                return await this.sendStandardTweet(
                    client,
                    truncateContent,
                    tweetId
                );
            } else {
                return noteTweetResult.data.notetweet_create.tweet_results
                    .result;
            }
        } catch (error) {
            throw new Error(`Note Tweet failed: ${error}`);
        }
    }

    async sendStandardTweet(
        client: ClientBase,
        content: string,
        tweetId?: string,
        mediaData?: MediaData[]
    ) {
        try {
            const standardTweetResult = await client.requestQueue.add(
                async () =>
                    await client.twitterClient.sendTweet(
                        content,
                        tweetId,
                        mediaData
                    )
            );
            const body : any = await standardTweetResult.json();
            if (!body?.data?.create_tweet?.tweet_results?.result) {
                Logger.error("Error sending tweet; Bad response:", body);
                return;
            }
            return body.data.create_tweet.tweet_results.result;
        } catch (error) {
            Logger.error("Error sending standard Tweet:", error);
            throw error;
        }
    }

    async postTweet(
        runtime: any,
        client: ClientBase,
        tweetTextForPosting: string,
        roomId: UUID,
        rawTweetContent: string,
        twitterUsername: string,
        mediaData?: MediaData[]
    ) {
        try {
            Logger.log(`Posting new tweet:\n`);

            let result;

            if (tweetTextForPosting.length > DEFAULT_MAX_TWEET_LENGTH) {
                result = await this.handleNoteTweet(
                    client,
                    tweetTextForPosting,
                    undefined,
                    mediaData
                );
            } else {
                result = await this.sendStandardTweet(
                    client,
                    tweetTextForPosting,
                    undefined,
                    mediaData
                );
            }

            const tweet = this.createTweetObject(
                result,
                client,
                twitterUsername
            );

            await this.processAndCacheTweet(
                runtime,
                client,
                tweet,
                roomId,
                rawTweetContent
            );
        } catch (error) {
            Logger.error("Error sending tweet:", error);
        }
    }

    /**
     * Generates and posts a new tweet. If isDryRun is true, only logs what would have been posted.
     */
    async generateNewTweet() {
        Logger.log("Generating new tweet");

        try {
            const roomId = stringToUuid(
                "twitter_generate_room-" + this.client.profile?.username || ""
            );
            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.client.profile?.username || "",
                this.runtime.character.name,
                "twitter"
            );

            const topics = this.runtime.character.topics.join(", ");
            const maxTweetLength = this.client.twitterConfig.MAX_TWEET_LENGTH;
            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: roomId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics || "",
                        action: "TWEET",
                    },
                },
                {
                    twitterUserName: this.client.profile?.username || "",
                    maxTweetLength,
                }
            );

            // const context = composeContext({
            //     state,
            //     template:
            //         this.runtime.character.templates?.twitterPostTemplate ||
            //         twitterPostTemplate,
            // });
            const context = "";

            Logger.debug("generate post prompt:\n" + context);

            const response = "response"
            // await generateText({
            //     runtime: this.runtime,
            //     context,
            //     modelClass: ModelClass.SMALL,
            // });

            const rawTweetContent = cleanJsonResponse(response);

            // First attempt to clean content
            let tweetTextForPosting = null;
            let mediaData = null;

            // Try parsing as JSON first
            const parsedResponse = parseJSONObjectFromText(rawTweetContent);
            if (parsedResponse?.text) {
                tweetTextForPosting = parsedResponse.text;
            }

            if (
                parsedResponse?.attachments &&
                parsedResponse?.attachments.length > 0
            ) {
                mediaData = await fetchMediaData(parsedResponse.attachments);
            }

            // Try extracting text attribute
            if (!tweetTextForPosting) {
                const parsingText = extractAttributes(rawTweetContent, [
                    "text",
                ]).text;
                if (parsingText) {
                    tweetTextForPosting = truncateToCompleteSentence(
                        extractAttributes(rawTweetContent, ["text"]).text || "",
                        this.client.twitterConfig.MAX_TWEET_LENGTH
                    );
                }
            }

            // Use the raw text
            if (!tweetTextForPosting) {
                tweetTextForPosting = rawTweetContent;
            }

            // Truncate the content to the maximum tweet length specified in the environment settings, ensuring the truncation respects sentence boundaries.
            if (maxTweetLength) {
                tweetTextForPosting = truncateToCompleteSentence(
                    tweetTextForPosting,
                    maxTweetLength
                );
            }

            const removeQuotes = (str: string) =>
                str.replace(/^['"](.*)['"]$/, "$1");

            const fixNewLines = (str: string) => str.replaceAll(/\\n/g, "\n\n"); //ensures double spaces

            // Final cleaning
            tweetTextForPosting = removeQuotes(
                fixNewLines(tweetTextForPosting)
            );

            if (this.isDryRun) {
                Logger.info(
                    `Dry run: would have posted tweet: ${tweetTextForPosting}`
                );
                return;
            }

            try {
                if (this.approvalRequired) {
                    // Send for approval instead of posting directly
                    Logger.log(
                        `Sending Tweet For Approval:\n ${tweetTextForPosting}`
                    );
                    await this.sendForApproval(
                        tweetTextForPosting,
                        roomId,
                        rawTweetContent
                    );
                    Logger.log("Tweet sent for approval");
                } else {
                    Logger.log(
                        `Posting new tweet:\n ${tweetTextForPosting}`
                    );
                    this.postTweet(
                        this.runtime,
                        this.client,
                        tweetTextForPosting,
                        roomId,
                        rawTweetContent,
                        this.twitterUsername,
                        mediaData || []
                    );
                }
            } catch (error) {
                Logger.error("Error sending tweet:", error);
            }
        } catch (error) {
            Logger.error("Error generating new tweet:", error);
        }
    }

    private async generateTweetContent(
        tweetState: any,
        options?: {
            template?: TemplateType;
            context?: string;
        }
    ): Promise<string> {
        // const context = composeContext({
        //     state: tweetState,
        //     template:
        //         options?.template ||
        //         this.runtime.character.templates?.twitterPostTemplate ||
        //         twitterPostTemplate,
        // });
        const context = "";

        const response = "response"
        // await generateText({
        //     runtime: this.runtime,
        //     context: options?.context || context,
        //     modelClass: ModelClass.SMALL,
        // });

        Logger.log("generate tweet content response:\n" + response);

        // First clean up any markdown and newlines
        const cleanedResponse = cleanJsonResponse(response);

        // Try to parse as JSON first
        const jsonResponse : any = parseJSONObjectFromText(cleanedResponse);
        if (jsonResponse?.text) {
            const truncateContent = truncateToCompleteSentence(
                jsonResponse.text,
                this.client.twitterConfig.MAX_TWEET_LENGTH
            );
            return truncateContent;
        }
        if (typeof jsonResponse === "object") {
            const possibleContent =
                jsonResponse.content ||
                jsonResponse.message ||
                jsonResponse.response;
            if (possibleContent) {
                const truncateContent = truncateToCompleteSentence(
                    possibleContent,
                    this.client.twitterConfig.MAX_TWEET_LENGTH
                );
                return truncateContent;
            }
        }

        let truncateContent = null;
        // Try extracting text attribute
        const parsingText = extractAttributes(cleanedResponse, ["text"]).text;
        if (parsingText) {
            truncateContent = truncateToCompleteSentence(
                parsingText,
                this.client.twitterConfig.MAX_TWEET_LENGTH
            );
        }

        if (!truncateContent) {
            // If not JSON or no valid content found, clean the raw text
            truncateContent = truncateToCompleteSentence(
                cleanedResponse,
                this.client.twitterConfig.MAX_TWEET_LENGTH
            );
        }

        return truncateContent;
    }

    /**
     * Processes tweet actions (likes, retweets, quotes, replies). If isDryRun is true,
     * only simulates and logs actions without making API calls.
     */
    private async processTweetActions() {
        if (this.isProcessing) {
            Logger.log("Already processing tweet actions, skipping");
            return null;
        }

        try {
            this.isProcessing = true;
            this.lastProcessTime = Date.now();

            Logger.log("Processing tweet actions");

            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.twitterUsername,
                this.runtime.character.name,
                "twitter"
            );

            const timelines = await this.client.fetchTimelineForActions(
                MAX_TIMELINES_TO_FETCH
            );
            const maxActionsProcessing =
                this.client.twitterConfig.MAX_ACTIONS_PROCESSING;
            const processedTimelines : any[] = [];

            for (const tweet of timelines) {
                try {
                    // Skip if we've already processed this tweet
                    const memory =
                        await this.runtime.messageManager.getMemoryById(
                            stringToUuid(tweet.id + "-" + this.runtime.agentId)
                        );
                    if (memory) {
                        Logger.log(
                            `Already processed tweet ID: ${tweet.id}`
                        );
                        continue;
                    }

                    const roomId = stringToUuid(
                        tweet.conversationId + "-" + this.runtime.agentId
                    );

                    const tweetState = await this.runtime.composeState(
                        {
                            userId: this.runtime.agentId,
                            roomId,
                            agentId: this.runtime.agentId,
                            content: { text: "", action: "" },
                        },
                        {
                            twitterUserName: this.twitterUsername,
                            currentTweet: `ID: ${tweet.id}\nFrom: ${tweet.name} (@${tweet.username})\nText: ${tweet.text}`,
                        }
                    );

                    // const actionContext = composeContext({
                    //     state: tweetState,
                    //     template:
                    //         this.runtime.character.templates
                    //             ?.twitterActionTemplate ||
                    //         twitterActionTemplate,
                    // });
                    const actionContext = "";

                    const actionResponse = "actionResponse"
                    // await generateTweetActions({
                    //     runtime: this.runtime,
                    //     context: actionContext,
                    //     modelClass: ModelClass.SMALL,
                    // });

                    if (!actionResponse) {
                        Logger.log(
                            `No valid actions generated for tweet ${tweet.id}`
                        );
                        continue;
                    }
                    processedTimelines.push({
                        tweet: tweet,
                        actionResponse: actionResponse,
                        tweetState: tweetState,
                        roomId: roomId,
                    });
                } catch (error) {
                    Logger.error(
                        `Error processing tweet ${tweet.id}:`,
                        error
                    );
                    continue;
                }
            }

            const sortProcessedTimeline = (arr: typeof processedTimelines) => {
                return arr.sort((a, b) => {
                    // Count the number of true values in the actionResponse object
                    const countTrue = (obj: typeof a.actionResponse) =>
                        Object.values(obj).filter(Boolean).length;

                    const countA = countTrue(a.actionResponse);
                    const countB = countTrue(b.actionResponse);

                    // Primary sort by number of true values
                    if (countA !== countB) {
                        return countB - countA;
                    }

                    // Secondary sort by the "like" property
                    if (a.actionResponse.like !== b.actionResponse.like) {
                        return a.actionResponse.like ? -1 : 1;
                    }

                    // Tertiary sort keeps the remaining objects with equal weight
                    return 0;
                });
            };
            // Sort the timeline based on the action decision score,
            // then slice the results according to the environment variable to limit the number of actions per cycle.
            const sortedTimelines = sortProcessedTimeline(
                processedTimelines
            ).slice(0, maxActionsProcessing);

            return this.processTimelineActions(sortedTimelines); // Return results array to indicate completion
        } catch (error) {
            Logger.error("Error in processTweetActions:", error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Processes a list of timelines by executing the corresponding tweet actions.
     * Each timeline includes the tweet, action response, tweet state, and room context.
     * Results are returned for tracking completed actions.
     *
     * @param timelines - Array of objects containing tweet details, action responses, and state information.
     * @returns A promise that resolves to an array of results with details of executed actions.
     */
    private async processTimelineActions(
        timelines: {
            tweet: Tweet;
            actionResponse: ActionResponse;
            tweetState: State;
            roomId: UUID;
        }[]
    ): Promise<
        {
            tweetId: string;
            actionResponse: ActionResponse;
            executedActions: string[];
        }[]
    > {
        const results = [];
        for (const timeline of timelines) {
            const { actionResponse, tweetState, roomId, tweet } = timeline;
            try {
                const executedActions: string[] = [];
                // Execute actions
                if (actionResponse.like) {
                    if (this.isDryRun) {
                        Logger.info(
                            `Dry run: would have liked tweet ${tweet.id}`
                        );
                        executedActions.push("like (dry run)");
                    } else {
                        try {
                            await this.client.twitterClient.likeTweet(tweet.id || "");
                            executedActions.push("like");
                            Logger.log(`Liked tweet ${tweet.id}`);
                        } catch (error) {
                            Logger.error(
                                `Error liking tweet ${tweet.id}:`,
                                error
                            );
                        }
                    }
                }

                if (actionResponse.retweet) {
                    if (this.isDryRun) {
                        Logger.info(
                            `Dry run: would have retweeted tweet ${tweet.id}`
                        );
                        executedActions.push("retweet (dry run)");
                    } else {
                        try {
                            await this.client.twitterClient.retweet(tweet.id || "");
                            executedActions.push("retweet");
                            Logger.log(`Retweeted tweet ${tweet.id}`);
                        } catch (error) {
                            Logger.error(
                                `Error retweeting tweet ${tweet.id}:`,
                                error
                            );
                        }
                    }
                }

                if (actionResponse.quote) {
                    try {
                        // Build conversation thread for context
                        const thread = await buildConversationThread(
                            tweet,
                            this.client
                        );
                        const formattedConversation = thread
                            .map(
                                (t: any) =>
                                    `@${t.username} (${new Date(
                                        t.timestamp * 1000
                                    ).toLocaleString()}): ${t.text}`
                            )
                            .join("\n\n");

                        // Generate image descriptions if present
                        const imageDescriptions = [];
                        if (tweet.photos?.length > 0) {
                            Logger.log(
                                "Processing images in tweet for context"
                            );
                            for (const photo of tweet.photos) {
                                const description = await this.runtime
                                    .getService(
                                        ServiceType.IMAGE_DESCRIPTION
                                    ) as IImageDescriptionService;
                                imageDescriptions.push(description);
                            }
                        }

                        // Handle quoted tweet if present
                        let quotedContent = "";
                        if (tweet.quotedStatusId) {
                            try {
                                const quotedTweet =
                                    await this.client.twitterClient.getTweet(
                                        tweet.quotedStatusId
                                    );
                                if (quotedTweet) {
                                    quotedContent = `\nQuoted Tweet from @${quotedTweet.username}:\n${quotedTweet.text}`;
                                }
                            } catch (error) {
                                Logger.error(
                                    "Error fetching quoted tweet:",
                                    error
                                );
                            }
                        }

                        // Compose rich state with all context
                        const enrichedState = await this.runtime.composeState(
                            {
                                userId: this.runtime.agentId,
                                roomId: stringToUuid(
                                    tweet.conversationId +
                                        "-" +
                                        this.runtime.agentId
                                ),
                                agentId: this.runtime.agentId,
                                content: {
                                    text: tweet.text,
                                    action: "QUOTE",
                                },
                            },
                            {
                                twitterUserName: this.twitterUsername,
                                currentPost: `From @${tweet.username}: ${tweet.text}`,
                                formattedConversation,
                                imageContext:
                                    imageDescriptions.length > 0
                                        ? `\nImages in Tweet:\n${imageDescriptions
                                              .map(
                                                  (desc, i) =>
                                                      `Image ${i + 1}: ${desc}`
                                              )
                                              .join("\n")}`
                                        : "",
                                quotedContent,
                            }
                        );

                        const quoteContent = await this.generateTweetContent(
                            enrichedState,
                            {
                                template:
                                    this.runtime.character.templates
                                        ?.twitterMessageHandlerTemplate ||
                                    twitterMessageHandlerTemplate,
                            }
                        );

                        if (!quoteContent) {
                            Logger.error(
                                "Failed to generate valid quote tweet content"
                            );
                            return [];
                        }

                        Logger.log(
                            "Generated quote tweet content:",
                            quoteContent
                        );
                        // Check for dry run mode
                        if (this.isDryRun) {
                            Logger.info(
                                `Dry run: A quote tweet for tweet ID ${tweet.id} would have been posted with the following content: "${quoteContent}".`
                            );
                            executedActions.push("quote (dry run)");
                        } else {
                            // Send the tweet through request queue
                            const result = await this.client.requestQueue.add(
                                async () =>
                                    await (this.client as any).twitterClient.sendQuoteTweet(
                                        quoteContent,
                                        tweet.id || ""
                                    )
                            );

                            const body = await result.json();

                            if (
                                body?.data?.create_tweet?.tweet_results?.result
                            ) {
                                Logger.log(
                                    "Successfully posted quote tweet"
                                );
                                executedActions.push("quote");

                                // Cache generation context for debugging
                                await this.runtime.cacheManager.set(
                                    `twitter/quote_generation_${tweet.id}.txt`,
                                    `Context:\n${enrichedState}\n\nGenerated Quote:\n${quoteContent}`
                                );
                            } else {
                                Logger.error(
                                    "Quote tweet creation failed:",
                                    body
                                );
                            }
                        }
                    } catch (error) {
                        Logger.error(
                            "Error in quote tweet generation:",
                            error
                        );
                    }
                }

                if (actionResponse.reply) {
                    try {
                        await this.handleTextOnlyReply(
                            tweet,
                            tweetState,
                            executedActions
                        );
                    } catch (error) {
                        Logger.error(
                            `Error replying to tweet ${tweet.id}:`,
                            error
                        );
                    }
                }

                // Add these checks before creating memory
                await this.runtime.ensureRoomExists(roomId);
                await this.runtime.ensureUserExists(
                    stringToUuid(tweet.userId || ""),
                    tweet.username,
                    tweet.name,
                    "twitter"
                );
                await this.runtime.ensureParticipantInRoom(
                    this.runtime.agentId,
                    roomId
                );

                // if (!this.isDryRun) {
                //     // Then create the memory
                //     await this.runtime.messageManager.createMemory({
                //         id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                //         userId: stringToUuid(tweet.userId || ""),
                //         content: {
                //             text: tweet.text,
                //             url: tweet.permanentUrl,
                //             source: "twitter",
                //             action: executedActions.join(","),
                //         },
                //         agentId: this.runtime.agentId,
                //         roomId,
                //         embedding: getEmbeddingZeroVector(),
                //         createdAt: tweet.timestamp ? tweet.timestamp * 1000 : 0,
                //     });
                // }

                results.push({
                    tweetId: tweet.id,
                    actionResponse: actionResponse,
                    executedActions,
                });
            } catch (error) {
                Logger.error(`Error processing tweet ${tweet.id}:`, error);
                continue;
            }
        }

        return results as {
            tweetId: string;
            actionResponse: ActionResponse;
            executedActions: string[];
        }[];
    }

    /**
     * Handles text-only replies to tweets. If isDryRun is true, only logs what would
     * have been replied without making API calls.
     */
    private async handleTextOnlyReply(
        tweet: Tweet,
        tweetState: any,
        executedActions: string[]
    ) {
        try {
            // Build conversation thread for context
            const thread = await buildConversationThread(tweet, this.client);
            const formattedConversation = thread
                .map(
                    (t: any) =>
                        `@${t.username} (${new Date(
                            t.timestamp * 1000
                        ).toLocaleString()}): ${t.text}`
                )
                .join("\n\n");

            // Generate image descriptions if present
            const imageDescriptions = [];
            if (tweet.photos?.length > 0) {
                Logger.log("Processing images in tweet for context");
                for (const photo of tweet.photos) {
                    const description = await this.runtime
                        .getService(
                            ServiceType.IMAGE_DESCRIPTION
                        ) as IImageDescriptionService;
                    imageDescriptions.push(description);
                }
            }

            // Handle quoted tweet if present
            let quotedContent = "";
            if (tweet.quotedStatusId) {
                try {
                    const quotedTweet =
                        await this.client.twitterClient.getTweet(
                            tweet.quotedStatusId
                        );
                    if (quotedTweet) {
                        quotedContent = `\nQuoted Tweet from @${quotedTweet.username}:\n${quotedTweet.text}`;
                    }
                } catch (error) {
                    Logger.error("Error fetching quoted tweet:", error);
                }
            }

            // Compose rich state with all context
            const enrichedState = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: stringToUuid(
                        tweet.conversationId + "-" + this.runtime.agentId
                    ),
                    agentId: this.runtime.agentId,
                    content: { text: tweet.text, action: "" },
                },
                {
                    twitterUserName: this.twitterUsername,
                    currentPost: `From @${tweet.username}: ${tweet.text}`,
                    formattedConversation,
                    imageContext:
                        imageDescriptions.length > 0
                            ? `\nImages in Tweet:\n${imageDescriptions
                                  .map((desc, i) => `Image ${i + 1}: ${desc}`)
                                  .join("\n")}`
                            : "",
                    quotedContent,
                }
            );

            // Generate and clean the reply content
            const replyText = await this.generateTweetContent(enrichedState, {
                template:
                    this.runtime.character.templates
                        ?.twitterMessageHandlerTemplate ||
                    twitterMessageHandlerTemplate,
            });

            if (!replyText) {
                Logger.error("Failed to generate valid reply content");
                return;
            }

            if (this.isDryRun) {
                Logger.info(
                    `Dry run: reply to tweet ${tweet.id} would have been: ${replyText}`
                );
                executedActions.push("reply (dry run)");
                return;
            }

            Logger.debug("Final reply text to be sent:", replyText);

            let result;

            if (replyText.length > DEFAULT_MAX_TWEET_LENGTH) {
                result = await this.handleNoteTweet(
                    this.client,
                    replyText,
                    tweet.id
                );
            } else {
                result = await this.sendStandardTweet(
                    this.client,
                    replyText,
                    tweet.id
                );
            }

            if (result) {
                Logger.log("Successfully posted reply tweet");
                executedActions.push("reply");

                // Cache generation context for debugging
                await this.runtime.cacheManager.set(
                    `twitter/reply_generation_${tweet.id}.txt`,
                    `Context:\n${enrichedState}\n\nGenerated Reply:\n${replyText}`
                );
            } else {
                Logger.error("Tweet reply creation failed");
            }
        } catch (error) {
            Logger.error("Error in handleTextOnlyReply:", error);
        }
    }

    async stop() {
        this.stopProcessingActions = true;
        if (this.approvalCheckInterval) {
            clearInterval(this.approvalCheckInterval);
        }
    }

    private async sendForApproval(
        tweetTextForPosting: string,
        roomId: UUID,
        rawTweetContent: string
    ): Promise<string | null> {
        try {
            const embed = {
                title: "New Tweet Pending Approval",
                description: tweetTextForPosting,
                fields: [
                    {
                        name: "Character",
                        value: this.client.profile?.username || "",
                        inline: true,
                    },
                    {
                        name: "Length",
                        value: tweetTextForPosting.length.toString(),
                        inline: true,
                    },
                ],
                footer: {
                    text: "Reply with '👍' to post or '❌' to discard, This will automatically expire and remove after 24 hours if no response received",
                },
                timestamp: new Date().toISOString(),
            };

            // Store the pending tweet
            const pendingTweetsKey = `twitter/${this.client.profile?.username || ""}/pendingTweet`;
            const currentPendingTweets =
                (await (this.runtime as any).cacheManager.get(
                    pendingTweetsKey
                ) as PendingTweet[] | null) || [];
            // Add new pending tweet
            // currentPendingTweets.push({
            //     tweetTextForPosting,
            //     roomId,
            //     rawTweetContent,
            //     discordMessageId: message.id,
            //     channelId: this.discordApprovalChannelId || "",
            //     timestamp: Date.now(),
            // });

            // // Store updated array
            // await (this.runtime as any).cacheManager.set(
            //     pendingTweetsKey,
            //     currentPendingTweets
            // );

            // return message.id;

            return "PENDING";
        } catch (error) {
            Logger.error(
                "Error Sending Twitter Post Approval Request:",
                error
            );
            return null;
        }
    }

    private async checkApprovalStatus(
        discordMessageId: string
    ): Promise<PendingTweetApprovalStatus> {
        try {
            // Fetch message and its replies from Discord
            // const channel = await (this.discordClientForApproval as any).channels.fetch(
            //     this.discordApprovalChannelId || ""
            // );

            // Logger.log(`channel ${JSON.stringify(channel)}`);

            // if (!(channel instanceof TextChannel)) {
            //     Logger.error("Invalid approval channel");
            //     return "PENDING";
            // }

            // // Fetch the original message and its replies
            // const message = await channel.messages.fetch(discordMessageId);

            // Look for thumbs up reaction ('👍')
            // const thumbsUpReaction = message.reactions.cache.find(
            //     (reaction) => reaction.emoji.name === "👍"
            // );

            // // Look for reject reaction ('❌')
            // const rejectReaction = message.reactions.cache.find(
            //     (reaction) => reaction.emoji.name === "❌"
            // );

            // // Check if the reaction exists and has reactions
            // if (rejectReaction) {
            //     const count = rejectReaction.count;
            //     if (count > 0) {
            //         return "REJECTED";
            //     }
            // }

            // Check if the reaction exists and has reactions
            // if (thumbsUpReaction) {
            //     // You might want to check for specific users who can approve
            //     // For now, we'll return true if anyone used thumbs up
            //     const count = thumbsUpReaction.count;
            //     if (count > 0) {
            //         return "APPROVED";
            //     }
            // }

            return "PENDING";
        } catch (error) {
            Logger.error("Error checking approval status:", error);
            return "PENDING";
        }
    }

    private async cleanupPendingTweet(discordMessageId: string) {
        const pendingTweetsKey = `twitter/${this.client.profile?.username || ""}/pendingTweet`;
        const currentPendingTweets =
            (await (this.runtime as any).cacheManager.get(
                pendingTweetsKey
            ) as PendingTweet[] | null) || [];

        if (currentPendingTweets) {
            // Remove the specific tweet
            const updatedPendingTweets = currentPendingTweets.filter(
                (tweet: any) => tweet.discordMessageId !== discordMessageId
            );

            if (updatedPendingTweets.length === 0) {
                await this.runtime.cacheManager.delete(pendingTweetsKey);
            } else {
                await this.runtime.cacheManager.set(
                    pendingTweetsKey,
                    updatedPendingTweets
                );
            }
        }
    }

    private async handlePendingTweet() {
        Logger.log("Checking Pending Tweets...");
        const pendingTweetsKey = `twitter/${this.client.profile?.username || ""}/pendingTweet`;
        const pendingTweets =
            (await (this.runtime as any).cacheManager.get(
                pendingTweetsKey
            ) as PendingTweet[] | null) || [];

        if (pendingTweets) {
            for (const pendingTweet of pendingTweets) {
                // Check if tweet is older than 24 hours
                const isExpired =
                    Date.now() - pendingTweet.timestamp > 24 * 60 * 60 * 1000;

                if (isExpired) {
                    Logger.log("Pending tweet expired, cleaning up");

                    // Notify on Discord about expiration
                    // try {
                    //     const channel =
                    //         await (this.discordClientForApproval as any).channels.fetch(
                    //             pendingTweet.channelId
                    //         );
                    //     if (channel instanceof TextChannel) {
                    //         const originalMessage = await channel.messages.fetch(
                    //             pendingTweet.discordMessageId
                    //         );
                    //         await originalMessage.reply(
                    //             "This tweet approval request has expired (24h timeout)."
                    //         );
                    //     }
                    // } catch (error) {
                    //     Logger.error(
                    //         "Error sending expiration notification:",
                    //         error
                    //     );
                    // }

                    await this.cleanupPendingTweet(pendingTweet.discordMessageId);
                    return;
                }

                // Check approval status
                Logger.log("Checking approval status...");
                const approvalStatus: PendingTweetApprovalStatus =
                    await this.checkApprovalStatus(pendingTweet.discordMessageId);

                if (approvalStatus === "APPROVED") {
                    Logger.log("Tweet Approved, Posting");
                    await this.postTweet(
                        this.runtime,
                        this.client,
                        pendingTweet.tweetTextForPosting,
                        pendingTweet.roomId,
                        pendingTweet.rawTweetContent,
                        this.twitterUsername
                    );

                    // Notify on Discord about posting
                    // try {
                    //     const channel =
                    //         await (this.discordClientForApproval as any).channels.fetch(
                    //             pendingTweet.channelId
                    //         );
                    //     if (channel instanceof TextChannel) {
                    //         const originalMessage = await channel.messages.fetch(
                    //             pendingTweet.discordMessageId
                    //         );
                    //         await originalMessage.reply(
                    //             "Tweet has been posted successfully! ✅"
                    //         );
                    //     }
                    // } catch (error) {
                    //     Logger.error(
                    //         "Error sending post notification:",
                    //         error
                    //     );
                    // }

                    await this.cleanupPendingTweet(pendingTweet.discordMessageId);
                } else if (approvalStatus === "REJECTED") {
                    Logger.log("Tweet Rejected, Cleaning Up");
                    await this.cleanupPendingTweet(pendingTweet.discordMessageId);
                    // Notify about Rejection of Tweet
                    // try {
                    //     const channel =
                    //         await (this.discordClientForApproval as any).channels.fetch(
                    //             pendingTweet.channelId
                    //         );
                    //     if (channel instanceof TextChannel) {
                    //         const originalMessage = await channel.messages.fetch(
                    //             pendingTweet.discordMessageId
                    //         );
                    //         await originalMessage.reply(
                    //             "Tweet has been rejected! ❌"
                    //         );
                    //     }
                    // } catch (error) {
                    //     Logger.error(
                    //         "Error sending rejection notification:",
                    //         error
                    //     );
                    // }
                }
            }
        }
    }
}
