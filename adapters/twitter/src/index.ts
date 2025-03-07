import { EventEmitter } from 'events';
import { Logger, RedisClient, RedisMessage, REDIS_CHANNELS } from '@hiveai/utils';
import { v4 as uuid } from 'uuid';
import {TwitterApi} from 'twitter-api-v2';
import { TweetHandler } from './handlers/tweetHandler';
import { TimelineHandler } from './handlers/timelineHandler';
import { MentionHandler } from './handlers/mentionHandler';

export interface TwitterConfig {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
    bearerToken: string;
    redis_url: string;
    autoReplyEnabled?: boolean;
    monitoredAccounts?: string[];
}

interface TwitterMention {
    id: string;
    text: string;
    authorId: string;
    authorUsername: string;
    createdAt: Date;
    inReplyToTweetId?: string;
}

interface TwitterTweet {
    id: string;
    text: string;
    authorId: string;
    authorUsername: string;
    createdAt: Date;
    metrics?: {
        retweets: number;
        replies: number;
        likes: number;
        quotes: number;
    };
}

export class TwitterAdapter extends EventEmitter {
    private static readonly POLLING_INTERVAL = 60000; // 1 minute
    private static readonly MENTIONS_INTERVAL = 120000; // 2 minutes
    private static readonly TIMELINE_INTERVAL = 300000; // 5 minutes
    private static readonly REQUEST_DELAY = 5000; // 5 seconds between requests
    private static readonly MAX_TWEETS_PER_REQUEST = 20;
    private static readonly MAX_MENTIONS_PER_REQUEST = 20;

    private client: TwitterApi;
    private readOnlyClient: TwitterApi;
    private redisClient: RedisClient;
    private tweetHandler: TweetHandler;
    private timelineHandler: TimelineHandler;
    private mentionHandler: MentionHandler;
    private config: TwitterConfig;
    private isInitialized: boolean = false;
    private isShuttingDown: boolean = false;
    private pollInterval!: NodeJS.Timeout;
    private mentionsInterval!: NodeJS.Timeout;
    private timelineInterval!: NodeJS.Timeout;
    private lastMentionId?: string;
    private lastTweetId?: string;

    constructor(config: TwitterConfig) {
        super();
        this.config = config;

        console.log(config);

        // Initialize Twitter client with user context (for posting tweets)
        this.client = new TwitterApi({
            appKey: config.apiKey,
            appSecret: config.apiSecret,
            accessToken: config.accessToken,
            accessSecret: config.accessSecret
        } as any);

        // Initialize read-only client with application context (for higher rate limits on reading)
        this.readOnlyClient = new TwitterApi(config.bearerToken as any);

        // Initialize Redis client
        this.redisClient = new RedisClient({ url: config.redis_url });

        // Initialize handlers
        this.tweetHandler = new TweetHandler(this.client);
        this.timelineHandler = new TimelineHandler(this.readOnlyClient);
        this.mentionHandler = new MentionHandler(this.client, this.readOnlyClient);

        // Setup process event handlers
        if (process.send) {
            process.on('SIGTERM', async () => {
                await this.stop();
                process.exit(0);
            });

            process.on('SIGINT', async () => {
                await this.stop();
                process.exit(0);
            });

            process.on('uncaughtException', async (error) => {
                Logger.error('Uncaught exception in Twitter adapter:', error);
                await this.stop();
                process.exit(1);
            });

            process.on('unhandledRejection', async (error) => {
                Logger.error('Unhandled rejection in Twitter adapter:', error);
                await this.stop();
                process.exit(1);
            });
        }
    }

    private async publishToRedis(type: string, payload: any): Promise<void> {
        try {
            await this.redisClient.publish(REDIS_CHANNELS.SOCIAL_INBOUND, {
                id: uuid(),
                timestamp: Date.now(),
                type: 'INTERNAL',
                destination: 'hivemind/ceo',
                source: 'twitter',
                payload: {
                    type,
                    payload
                }
            });
            Logger.info('TWITTER :: Published to Redis:', { type });
        } catch (error) {
            Logger.error('Error publishing Twitter data to Redis:', error);
        }
    }

    private async handleIncomingRedisMessage(message: RedisMessage): Promise<void> {
        try {
            Logger.info("Twitter Adapter :: Received Redis message:", {
                type: message.type,
                source: message.source,
                destination: message.destination,
                payloadType: message.payload?.type
            });

            if (message.type !== 'INTERNAL' || !message.payload) {
                Logger.warn('Skipping invalid message format:', { message });
                return;
            }

            switch (message.payload.type) {
                case 'tweet':
                    Logger.info('Creating new tweet:', {
                        text: message.payload.text
                    });
                    const tweetResult = await this.tweetHandler.postTweet(message.payload.text);
                    await this.publishToRedis('tweet_posted', {
                        id: tweetResult.id,
                        text: tweetResult.text
                    });
                    break;

                case 'reply':
                    if (!message.payload.inReplyToTweetId) {
                        Logger.error('Missing tweet ID to reply to');
                        return;
                    }
                    Logger.info('Replying to tweet:', {
                        inReplyToTweetId: message.payload.inReplyToTweetId,
                        text: message.payload.text
                    });
                    const replyResult = await this.tweetHandler.replyToTweet(
                        message.payload.inReplyToTweetId,
                        message.payload.text
                    );
                    await this.publishToRedis('reply_posted', {
                        id: replyResult.id,
                        inReplyToTweetId: message.payload.inReplyToTweetId,
                        text: replyResult.text
                    });
                    break;

                case 'retweet':
                    if (!message.payload.tweetId) {
                        Logger.error('Missing tweet ID to retweet');
                        return;
                    }
                    Logger.info('Retweeting tweet:', {
                        tweetId: message.payload.tweetId
                    });
                    const retweetResult = await this.tweetHandler.retweet(message.payload.loggedUserId, message.payload.tweetId);
                    await this.publishToRedis('retweet_posted', {
                        id: retweetResult.id,
                        retweetedId: message.payload.tweetId
                    });
                    break;

                case 'get_user_timeline':
                    if (!message.payload.username) {
                        Logger.error('Missing username for timeline fetch');
                        return;
                    }
                    Logger.info('Fetching user timeline:', {
                        username: message.payload.username
                    });
                    const timeline = await this.timelineHandler.getUserTimeline(
                        message.payload.username,
                        TwitterAdapter.MAX_TWEETS_PER_REQUEST
                    );
                    await this.publishToRedis('user_timeline', {
                        username: message.payload.username,
                        tweets: timeline
                    });
                    break;

                case 'get_tweet':
                    if (!message.payload.tweetId) {
                        Logger.error('Missing tweet ID to fetch');
                        return;
                    }
                    Logger.info('Fetching tweet:', {
                        tweetId: message.payload.tweetId
                    });
                    const tweet = await this.timelineHandler.getTweet(message.payload.tweetId);
                    await this.publishToRedis('tweet_details', tweet);
                    break;

                case 'search_tweets':
                    if (!message.payload.query) {
                        Logger.error('Missing query for tweet search');
                        return;
                    }
                    Logger.info('Searching tweets:', {
                        query: message.payload.query
                    });
                    const searchResults = await this.timelineHandler.searchTweets(
                        message.payload.query,
                        TwitterAdapter.MAX_TWEETS_PER_REQUEST
                    );
                    await this.publishToRedis('search_results', {
                        query: message.payload.query,
                        tweets: searchResults
                    });
                    break;

                default:
                    Logger.warn('Unknown payload type:', message.payload.type);
            }
        } catch (error) {
            Logger.error('Error handling Redis message:', error);
        }
    }

    private async pollForMentions(): Promise<void> {
        try {
            Logger.info('Polling for new mentions...');
            const mentions = await this.mentionHandler.getRecentMentions(
                TwitterAdapter.MAX_MENTIONS_PER_REQUEST,
                this.lastMentionId
            );

            if (mentions.length > 0) {
                Logger.info(`Found ${mentions.length} new mentions`);
                
                // Update last mention ID for next poll
                this.lastMentionId = mentions[0].id;
                
                // Process mentions from oldest to newest
                for (const mention of mentions.reverse()) {
                    await this.publishToRedis('mention', mention);
                    
                    // Auto-reply if enabled
                    if (this.config.autoReplyEnabled) {
                        await this.processMention(mention);
                    }
                    
                    // Add delay between processing mentions to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, TwitterAdapter.REQUEST_DELAY));
                }
            } else {
                Logger.info('No new mentions found');
            }
        } catch (error) {
            Logger.error('Error polling for mentions:', error);
        }
    }

    private async pollMonitoredAccounts(): Promise<void> {
        if (!this.config.monitoredAccounts || this.config.monitoredAccounts.length === 0) {
            return;
        }

        try {
            Logger.info('Polling monitored accounts for new tweets...');
            
            for (const username of this.config.monitoredAccounts) {
                Logger.info(`Checking for new tweets from ${username}...`);
                
                const tweets = await this.timelineHandler.getUserTimeline(
                    username,
                    5,
                    this.lastTweetId
                );
                
                if (tweets.length > 0) {
                    Logger.info(`Found ${tweets.length} new tweets from ${username}`);
                    
                    // Update last tweet ID
                    if (!this.lastTweetId || tweets[0].id > this.lastTweetId) {
                        this.lastTweetId = tweets[0].id;
                    }
                    
                    // Process tweets from oldest to newest
                    for (const tweet of tweets.reverse()) {
                        await this.publishToRedis('monitored_tweet', tweet);
                    }
                } else {
                    Logger.info(`No new tweets from ${username}`);
                }
                
                // Add delay between checking accounts to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, TwitterAdapter.REQUEST_DELAY));
            }
        } catch (error) {
            Logger.error('Error polling monitored accounts:', error);
        }
    }

    private async processMention(mention: TwitterMention): Promise<void> {
        try {
            // Simple auto-reply example - this would be more sophisticated in a real implementation
            const replyText = `Thanks for mentioning us, @${mention.authorUsername}! We'll get back to you soon.`;
            
            const reply = await this.tweetHandler.replyToTweet(mention.id, replyText);
            
            Logger.info('Auto-replied to mention:', {
                mentionId: mention.id,
                replyId: reply.id
            });
            
            await this.publishToRedis('auto_reply', {
                mentionId: mention.id,
                replyId: reply.id,
                text: replyText
            });
        } catch (error) {
            Logger.error('Error processing mention:', error);
        }
    }

    async start(): Promise<void> {
        if (this.isInitialized) {
            Logger.warn('Twitter adapter already initialized');
            return;
        }

        try {
            // Verify credentials
            const currentUser : any = await this.client.v2.me();
            Logger.info(`Twitter bot logged in as @${currentUser.screen_name}`);

            // Subscribe to Redis messages
            await this.redisClient.subscribe(REDIS_CHANNELS.SOCIAL_OUTBOUND, 
                async (message: RedisMessage) => {
                    if (message.destination === 'twitter') {
                        await this.handleIncomingRedisMessage(message);
                    }
            });

            // Start polling for mentions
            this.mentionsInterval = setInterval(
                () => this.pollForMentions(),
                TwitterAdapter.MENTIONS_INTERVAL
            );

            // Start polling monitored accounts
            if (this.config.monitoredAccounts && this.config.monitoredAccounts.length > 0) {
                this.timelineInterval = setInterval(
                    () => this.pollMonitoredAccounts(),
                    TwitterAdapter.TIMELINE_INTERVAL
                );
            }

            this.isInitialized = true;
            Logger.info('Twitter adapter started successfully');

            // Notify parent process that we're ready
            if (process.send) {
                process.send({ type: 'ready', service: 'twitter' });
            }
        } catch (error) {
            Logger.error('Failed to start Twitter adapter:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        Logger.info('Stopping Twitter adapter...');

        try {
            // Clear intervals
            if (this.mentionsInterval) {
                clearInterval(this.mentionsInterval);
            }
            
            if (this.timelineInterval) {
                clearInterval(this.timelineInterval);
            }
            
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
            }

            // Disconnect from Redis
            await this.redisClient.disconnect();
            
            Logger.info('Twitter adapter stopped successfully');
        } catch (error) {
            Logger.error('Error stopping Twitter adapter:', error);
            throw error;
        }
    }
}
