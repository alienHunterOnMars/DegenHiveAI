import { SearchMode, type Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateMessageResponse,
    generateShouldRespond,
    messageCompletionFooter,
    shouldRespondFooter,
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State,
    stringToUuid,
    getEmbeddingZeroVector,
    type IImageDescriptionService,
    ServiceType
} from "@hiveai/core";
import { Logger } from "@hiveai/utils";
import type { ClientBase } from "./base";
import { buildConversationThread, sendTweet, wait } from "./utils";

export const twitterMessageHandlerTemplate =
    `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

{{recentPosts}}

# TASK: Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}) while using the thread of tweets as additional context:

Current Post:
{{currentPost}}
Here is the descriptions of images in the Current post.
{{imageDescriptions}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Generate a post in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}). You MUST include an action if the current post text includes a prompt that is similar to one of the available actions mentioned here:
{{actionNames}}
{{actions}}

Here is the current post text again. Remember to include an action if the current post text includes a prompt that asks for one of the available actions mentioned above (does not need to be exact)
{{currentPost}}
Here is the descriptions of images in the Current post.
{{imageDescriptions}}
` + messageCompletionFooter;

export const twitterShouldRespondTemplate = (targetUsersStr: string) =>
    `# INSTRUCTIONS: Determine if {{agentName}} (@{{twitterUserName}}) should respond to the message and participate in the conversation. Do not comment. Just respond with "true" or "false".

Response options are RESPOND, IGNORE and STOP.

PRIORITY RULE: ALWAYS RESPOND to these users regardless of topic or message content: ${targetUsersStr}. Topic relevance should be ignored for these users.

For other users:
- {{agentName}} should RESPOND to messages directed at them
- {{agentName}} should RESPOND to conversations relevant to their background
- {{agentName}} should IGNORE irrelevant messages
- {{agentName}} should IGNORE very short messages unless directly addressed
- {{agentName}} should STOP if asked to stop
- {{agentName}} should STOP if conversation is concluded
- {{agentName}} is in a room with other users and wants to be conversational, but not annoying.

IMPORTANT:
- {{agentName}} (aka @{{twitterUserName}}) is particularly sensitive about being annoying, so if there is any doubt, it is better to IGNORE than to RESPOND.
- For users not in the priority list, {{agentName}} (@{{twitterUserName}}) should err on the side of IGNORE rather than RESPOND if in doubt.

Recent Posts:
{{recentPosts}}

Current Post:
{{currentPost}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Respond with [RESPOND] if {{agentName}} should respond, or [IGNORE] if {{agentName}} should not respond to the last message and [STOP] if {{agentName}} should stop participating in the conversation.
` + shouldRespondFooter;

export class TwitterInteractionClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private isDryRun: boolean;
    private twitterUserId: string;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
        this.twitterUserId = "";
    }

    async start() {
        const handleTwitterInteractionsLoop = () => {
            this.handleTwitterInteractions();
            setTimeout(
                handleTwitterInteractionsLoop,
                // Defaults to 2 minutes
                this.client.twitterConfig.TWITTER_POLL_INTERVAL * 1000
            );
        };
        handleTwitterInteractionsLoop();
    }

    async handleTwitterInteractions() {
        Logger.log("Checking Twitter interactions");

        const twitterUsername = this.client.profile?.username || "";
        try {
            // Check for mentions
            const mentionCandidates = (
                await this.client.fetchSearchTweets(
                    `@${twitterUsername}`,
                    20,
                    SearchMode.Latest
                )
            ).tweets;

            Logger.log(
                "Completed checking mentioned tweets:",
                mentionCandidates.length
            );
            let uniqueTweetCandidates = [...mentionCandidates];
            // Only process target users if configured
            if (this.client.twitterConfig.TWITTER_TARGET_USERS.length) {
                const TARGET_USERS =
                    this.client.twitterConfig.TWITTER_TARGET_USERS;

                Logger.log("Processing target users:", TARGET_USERS);

                if (TARGET_USERS.length > 0) {
                    // Create a map to store tweets by user
                    const tweetsByUser = new Map<string, Tweet[]>();

                    // Fetch tweets from all target users
                    for (const username of TARGET_USERS) {
                        try {
                            const userTweets = (
                                await this.client.twitterClient.fetchSearchTweets(
                                    `from:${username}`,
                                    3,
                                    SearchMode.Latest
                                )
                            ).tweets;

                            // Filter for unprocessed, non-reply, recent tweets
                            const validTweets = userTweets.filter((tweet) => {
                                const isUnprocessed =
                                    !this.client.lastCheckedTweetId ||
                                    Number.parseInt(tweet.id || "") >
                                        this.client.lastCheckedTweetId;
                                const isRecent =
                                    Date.now() - (tweet.timestamp || 0) * 1000 <
                                    2 * 60 * 60 * 1000;

                                Logger.log(`Tweet ${tweet.id} checks:`, {
                                    isUnprocessed,
                                    isRecent,
                                    isReply: tweet.isReply,
                                    isRetweet: tweet.isRetweet,
                                });

                                return (
                                    isUnprocessed &&
                                    !tweet.isReply &&
                                    !tweet.isRetweet &&
                                    isRecent
                                );
                            });

                            if (validTweets.length > 0) {
                                tweetsByUser.set(username, validTweets);
                                Logger.log(
                                    `Found ${validTweets.length} valid tweets from ${username}`
                                );
                            }
                        } catch (error) {
                            Logger.error(
                                `Error fetching tweets for ${username}:`,
                                error
                            );
                            continue;
                        }
                    }

                    // Select one tweet from each user that has tweets
                    const selectedTweets: Tweet[] = [];
                    for (const [username, tweets] of tweetsByUser) {
                        if (tweets.length > 0) {
                            // Randomly select one tweet from this user
                            const randomTweet =
                                tweets[
                                    Math.floor(Math.random() * tweets.length)
                                ];
                            selectedTweets.push(randomTweet);
                            Logger.log(
                                `Selected tweet from ${username}: ${randomTweet.text?.substring(0, 100)}`
                            );
                        }
                    }

                    // Add selected tweets to candidates
                    uniqueTweetCandidates = [
                        ...mentionCandidates,
                        ...selectedTweets,
                    ];
                }
            } else {
                Logger.log(
                    "No target users configured, processing only mentions"
                );
            }

            // Sort tweet candidates by ID in ascending order
            uniqueTweetCandidates
                .sort((a, b) => (a.id || "").localeCompare(b.id || ""))
                .filter((tweet) => tweet.userId !== this.client.profile?.id);

            // for each tweet candidate, handle the tweet
            for (const tweet of uniqueTweetCandidates) {
                if (
                    !this.client.lastCheckedTweetId ||
                    BigInt(tweet.id || "") > this.client.lastCheckedTweetId
                ) {
                    // Generate the tweetId UUID the same way it's done in handleTweet
                    const tweetId = stringToUuid(
                        tweet.id + "-" + this.runtime.agentId
                    );

                    // Check if we've already processed this tweet
                    const existingResponse =
                        await (this.runtime as any).messageManager.getMemoryById(
                            tweetId
                        );

                    if (existingResponse) {
                        Logger.log(
                            `Already responded to tweet ${tweet.id}, skipping`
                        );
                        continue;
                    }
                    Logger.log("New Tweet found", tweet.permanentUrl);

                    const roomId = stringToUuid(
                        tweet.conversationId + "-" + this.runtime.agentId
                    );

                    const userIdUUID =
                        tweet.userId === this.client.profile?.id
                            ? this.runtime.agentId
                            : stringToUuid(tweet.userId!);

                    await (this.runtime as any).ensureConnection(
                        userIdUUID,
                        roomId,
                        tweet.username,
                        tweet.name,
                        "twitter"
                    );

                    const thread = await buildConversationThread(
                        tweet,
                        (this.client as any)
                    );

                    const message = {
                        content: { 
                            text: tweet.text,
                            imageUrls: tweet.photos?.map(photo => photo.url) || []
                        },
                        agentId: this.runtime.agentId,
                        userId: userIdUUID,
                        roomId,
                    };

                    await this.handleTweet({
                        tweet: (tweet as any),
                        message: (message as any),
                        thread: (thread as any),
                    });

                    // Update the last checked tweet ID after processing each tweet
                    (this.client as any).lastCheckedTweetId = BigInt(tweet.id || "");
                }
            }

            // Save the latest checked tweet ID to the file
            await (this.client as any).cacheLatestCheckedTweetId();

            Logger.log("Finished checking Twitter interactions");
        } catch (error) {
            Logger.error("Error handling Twitter interactions:", error);
        }
    }

    private async handleTweet({
        tweet,
        message,
        thread,
    }: {
        tweet: Tweet;
        message: Memory;
        thread: Tweet[];
    }) {
        // Only skip if tweet is from self AND not from a target user
        if (tweet.userId === (this.client.profile?.id || "") &&
            !this.client.twitterConfig.TWITTER_TARGET_USERS.includes(tweet.username || "")) {
            return;
        }

        if (!message.content.text) {
            Logger.log("Skipping Tweet with no text", tweet.id);
            return { text: "", action: "IGNORE" };
        }

        Logger.log("Processing Tweet: ", tweet.id);
        const formatTweet = (tweet: Tweet) => {
            return `  ID: ${tweet.id}
  From: ${tweet.name} (@${tweet.username})
  Text: ${tweet.text}`;
        };
        const currentPost = formatTweet(tweet);

        const formattedConversation = thread
            .map(
                (tweet) => `@${tweet.username} (${new Date(
                    (tweet.timestamp || 0) * 1000
                ).toLocaleString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                })}):
        ${tweet.text}`
            )
            .join("\n\n");

        const imageDescriptionsArray = [];
        try{
            for (const photo of tweet.photos) {
                const description = await (this.runtime as any)
                    .getService(
                        ServiceType.IMAGE_DESCRIPTION
                    ) as IImageDescriptionService;
                imageDescriptionsArray.push(description);
            }
        } catch (error) {
    // Handle the error
    Logger.error("Error Occured during describing image: ", error);
}




        let state = await (this.runtime as any).composeState(message, {
            twitterClient: this.client.twitterClient,
            twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
            currentPost,
            formattedConversation,
            imageDescriptions: imageDescriptionsArray.length > 0
            ? `\nImages in Tweet:\n${imageDescriptionsArray.map((desc: any, i: number) =>
              `Image ${i + 1}: Title: ${desc.title}\nDescription: ${desc.description}`).join("\n\n")}`:""
        });

        // check if the tweet exists, save if it doesn't
        const tweetId = stringToUuid(tweet.id + "-" + this.runtime.agentId);
        const tweetExists =
            await (this.runtime as any).messageManager.getMemoryById(tweetId);

        if (!tweetExists) {
            Logger.log("tweet does not exist, saving");
            const userIdUUID = stringToUuid(tweet.userId as string);
            const roomId = stringToUuid(tweet.conversationId || "");

            const message = {
                id: tweetId,
                agentId: this.runtime.agentId,
                content: {
                    text: tweet.text,
                    url: tweet.permanentUrl,
                    imageUrls: tweet.photos?.map(photo => photo.url) || [],
                    inReplyTo: tweet.inReplyToStatusId
                        ? stringToUuid(
                              tweet.inReplyToStatusId +
                                  "-" +
                                  this.runtime.agentId
                          )
                        : undefined,
                },
                userId: userIdUUID,
                roomId,
                createdAt: tweet.timestamp ? tweet.timestamp * 1000 : 0,
            };
            (this.client as any).saveRequestMessage(message, state);
        }

        // get usernames into str
        const validTargetUsersStr =
            this.client.twitterConfig.TWITTER_TARGET_USERS.join(",");

        const shouldRespondContext = composeContext({
            state,
            template:
                (this.runtime as any).character.templates
                    ?.twitterShouldRespondTemplate ||
                (this.runtime as any).character?.templates?.shouldRespondTemplate ||
                twitterShouldRespondTemplate(validTargetUsersStr),
        });

        const shouldRespond = await generateShouldRespond({
            runtime: (this.runtime as any),
            context: shouldRespondContext,
            modelClass: ModelClass.MEDIUM,
        });

        // Promise<"RESPOND" | "IGNORE" | "STOP" | null> {
        if (shouldRespond !== "RESPOND") {
            Logger.log("Not responding to message");
            return { text: "Response Decision:", action: shouldRespond };
        }

        const context = composeContext({
            state: {
                ...state,
                // Convert actionNames array to string
                actionNames: Array.isArray(state.actionNames)
                    ? state.actionNames.join(', ')
                    : state.actionNames || '',
                actions: Array.isArray(state.actions)
                    ? state.actions.join('\n')
                    : state.actions || '',
                // Ensure character examples are included
                characterPostExamples: (this.runtime as any).character.messageExamples
                    ? (this.runtime as any).character.messageExamples
                        .map((example: any) =>
                            example.map((msg: any) =>
                                `${msg.user}: ${msg.content.text}${msg.content.action ? ` [Action: ${msg.content.action}]` : ''}`
                            ).join('\n')
                        ).join('\n\n')
                    : '',
            },
            template:
                (this.runtime as any).character.templates
                    ?.twitterMessageHandlerTemplate ||
                (this.runtime as any).character?.templates?.messageHandlerTemplate ||
                twitterMessageHandlerTemplate,
        });

        const response = await generateMessageResponse({
            runtime: (this.runtime as any),
            context,
            modelClass: ModelClass.LARGE,
        });

        const removeQuotes = (str: string) =>
            str.replace(/^['"](.*)['"]$/, "$1");

        const stringId = stringToUuid(tweet.id + "-" + (this.runtime as any).agentId);

        response.inReplyTo = stringId;

        response.text = removeQuotes(response.text);

        if (response.text) {
            if (this.isDryRun) {
                Logger.info(
                    `Dry run: Selected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}\nAgent's Output:\n${response.text}`
                );
            } else {
                try {
                    const callback: HandlerCallback = async (
                        response: Content,
                        tweetId?: string
                    ) => {
                        const memories = await sendTweet(
                            this.client,
                            response,
                            message.roomId,
                            this.client.twitterConfig.TWITTER_USERNAME,
                            tweetId || (tweet.id || "")
                        );
                        return memories;
                    };

                    const responseMessages = await callback(response);

                    state = (await (this.runtime as any).updateRecentMessageState(
                        state
                    )) as State;

                    for (const responseMessage of responseMessages) {
                        if (
                            responseMessage ===
                            responseMessages[responseMessages.length - 1]
                        ) {
                            responseMessage.content.action = response.action;
                        } else {
                            responseMessage.content.action = "CONTINUE";
                        }
                        await (this.runtime as any).messageManager.createMemory(
                            responseMessage
                        );
                    }
                    const responseTweetId =
                    responseMessages[responseMessages.length - 1]?.content
                        ?.tweetId;
                    await (this.runtime as any).processActions(
                        message,
                        responseMessages,
                        state,
                        (response: Content) => {
                            return callback(response, responseTweetId);
                        }
                    );

                    const responseInfo = `Context:\n\n${context}\n\nSelected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}\nAgent's Output:\n${response.text}`;

                    await (this.runtime as any).cacheManager.set(
                        `twitter/tweet_generation_${tweet.id}.txt`,
                        responseInfo
                    );
                    await wait();
                } catch (error) {
                    Logger.error(`Error sending response tweet: ${error}`);
                }
            }
        }
    }

    async buildConversationThread(
        tweet: Tweet,
        maxReplies = 10
    ): Promise<Tweet[]> {
        const thread: Tweet[] = [];
        const visited: Set<string> = new Set();

        const processThread = async (currentTweet: Tweet, depth = 0) => {
            Logger.log("Processing tweet:", {
                id: currentTweet.id,
                inReplyToStatusId: currentTweet.inReplyToStatusId,
                depth: depth,
            });

            if (!currentTweet) {
                Logger.log("No current tweet found for thread building");
                return;
            }

            if (depth >= maxReplies) {
                Logger.log("Reached maximum reply depth", depth);
                return;
            }

            // Handle memory storage
            const memory = await (this.runtime as any).messageManager.getMemoryById.call(this as TwitterInteractionClient,
                stringToUuid(currentTweet.id + "-" + (this.runtime as any).agentId)
            );
            if (!memory) {
                const roomId = stringToUuid(
                    currentTweet.conversationId + "-" + (this.runtime as any).agentId
                );
                const userId = stringToUuid(currentTweet.userId || "");

                await (this.runtime as any).ensureConnection(
                    userId,
                    roomId,
                    currentTweet.username,
                    currentTweet.name,
                    "twitter"
                );

                (this.runtime as any).messageManager.createMemory({
                    id: stringToUuid(
                        currentTweet.id + "-" + (this.runtime as any).agentId
                    ),
                    agentId: (this.runtime as any).agentId,
                    content: {
                        text: currentTweet.text,
                        source: "twitter",
                        url: currentTweet.permanentUrl,
                        imageUrls: currentTweet.photos?.map(photo => photo.url) || [],
                        inReplyTo: currentTweet.inReplyToStatusId
                            ? stringToUuid(
                                  currentTweet.inReplyToStatusId +
                                      "-" +
                                      this.runtime.agentId
                              )
                            : undefined,
                    },
                    createdAt: currentTweet.timestamp ? currentTweet.timestamp * 1000 : 0,
                    roomId,
                    userId:
                        currentTweet.userId === this.twitterUserId
                            ? (this.runtime as any).agentId
                            : stringToUuid(currentTweet.userId || ""),
                    embedding: getEmbeddingZeroVector(),
                });
            }

            if (visited.has(currentTweet.id || "")) {
                Logger.log("Already visited tweet:", currentTweet.id);
                return;
            }

            visited.add(currentTweet.id || "");
            thread.unshift(currentTweet);

            if (currentTweet.inReplyToStatusId) {
                Logger.log(
                    "Fetching parent tweet:",
                    currentTweet.inReplyToStatusId
                );
                try {
                    const parentTweet = await (this.client as any).twitterClient.getTweet(
                        currentTweet.inReplyToStatusId
                    );

                    if (parentTweet) {
                        Logger.log("Found parent tweet:", {
                            id: parentTweet.id,
                            text: parentTweet.text?.slice(0, 50),
                        });
                        await processThread(parentTweet, depth + 1);
                    } else {
                        Logger.log(
                            "No parent tweet found for:",
                            currentTweet.inReplyToStatusId
                        );
                    }
                } catch (error) {
                    Logger.log("Error fetching parent tweet:", {
                        tweetId: currentTweet.inReplyToStatusId,
                        error,
                    });
                }
            } else {
                Logger.log(
                    "Reached end of reply chain at:",
                    currentTweet.id
                );
            }
        };

        await processThread(tweet, 0);
        return thread;
    }
}