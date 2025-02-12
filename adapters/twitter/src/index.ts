import { ClientBase } from "./base";
import { validateTwitterConfig, type TwitterConfig } from "./environment";
import { TwitterInteractionClient } from "./interactions";
import { TwitterPostClient } from "./post";
import { TwitterSearchClient } from "./search";
import { TwitterSpaceClient } from "./spaces";
import { EventEmitter } from 'events';
import { Logger, REDIS_CHANNELS, RedisClient, RedisMessage } from '@hiveai/utils';
import { Tweet } from 'agent-twitter-client';
import { v4 as uuid } from 'uuid';

export *  from "./types";

/**
 * A manager that orchestrates all specialized Twitter logic:
 * - client: base operations (login, timeline caching, etc.)
 * - post: autonomous posting logic
 * - search: searching tweets / replying logic
 * - interaction: handling mentions, replies
 * - space: launching and managing Twitter Spaces (optional)
 */
class TwitterManager {
    client: ClientBase;

    post: TwitterPostClient;
    search?: TwitterSearchClient;
    space?: TwitterSpaceClient;
    interaction: TwitterInteractionClient;
    
    
    constructor(runtime: any, twitterConfig: TwitterConfig) {
        // Pass twitterConfig to the base client
        this.client = new ClientBase(runtime, twitterConfig);
 
        // Posting logic
        this.post = new TwitterPostClient(this.client, runtime);

        // Optional search logic (enabled if TWITTER_SEARCH_ENABLE is true)
        if (twitterConfig.TWITTER_SEARCH_ENABLE) {
            Logger.warn("Twitter/X client running in a mode that:");
            Logger.warn("1. violates consent of random users");
            Logger.warn("2. burns your rate limit");
            Logger.warn("3. can get your account banned");
            Logger.warn("use at your own risk");
            this.search = new TwitterSearchClient(this.client, runtime);
        }

        // Mentions and interactions
        this.interaction = new TwitterInteractionClient(this.client, runtime);

        // Optional Spaces logic (enabled if TWITTER_SPACES_ENABLE is true)
        if (twitterConfig.TWITTER_SPACES_ENABLE) {
            this.space = new TwitterSpaceClient(this.client, runtime);
        }
 
    }
}

export const TwitterClientInterface: any = {
    async start(runtime: any): Promise<TwitterManager> {
        const twitterConfig: TwitterConfig =
            await validateTwitterConfig(runtime);

        Logger.log("Twitter client started");

        const manager = new TwitterManager(runtime, twitterConfig);

        // Initialize login/session
        await manager.client.init();

        // Start the posting loop
        await manager.post.start();

        // Start the search logic if it exists
        if (manager.search) {
            await manager.search.start();
        }

        // Start interactions (mentions, replies)
        await manager.interaction.start();

        // If Spaces are enabled, start the periodic check
        if (manager.space) {
            manager.space.startPeriodicSpaceCheck();
        }

        return manager;
    },

    async stop(_runtime: any) {
        Logger.warn("Twitter client does not support stopping yet");
    },
};

export default TwitterClientInterface;


/// Twitter Adapter
/// ==============================
export class TwitterAdapter extends EventEmitter {
    private client: TwitterPostClient;
    private redisClient: RedisClient;
    private readonly config: TwitterConfig;

    constructor(config: TwitterConfig) {
        super();
        this.config = config;
        this.client = new TwitterPostClient((config as any), null);
        this.redisClient = new RedisClient({ url: config.REDIS_URL });
    }

    private async handleMention(tweet: Tweet): Promise<void> {
        try {
            await this.redisClient.publish(REDIS_CHANNELS.SOCIAL_INBOUND, {
                id: uuid(),
                timestamp: Date.now(),
                type: 'SOCIAL',
                source: 'twitter',
                payload: {
                    tweetId: tweet.id,
                    text: tweet.text,
                    userId: tweet.userId,
                    username: tweet.username,
                    inReplyToId: tweet.inReplyToStatusId,
                    type: 'mention'
                }
            });
            Logger.info('Published mention to Redis:', tweet.id);
        } catch (error) {
            Logger.error('Error publishing mention to Redis:', error);
        }
    }

    private async handleReply(tweet: Tweet): Promise<void> {
        try {
            await this.redisClient.publish(REDIS_CHANNELS.SOCIAL_INBOUND, {
                id: uuid(),
                timestamp: Date.now(),
                type: 'SOCIAL',
                source: 'twitter',
                payload: {
                    tweetId: tweet.id,
                    text: tweet.text,
                    userId: tweet.userId,
                    username: tweet.username,
                    inReplyToId: tweet.inReplyToStatusId,
                    type: 'reply'
                }
            });
            Logger.info('Published reply to Redis:', tweet.id);
        } catch (error) {
            Logger.error('Error publishing reply to Redis:', error);
        }
    }

    private async handleIncomingRedisMessage(message: RedisMessage): Promise<void> {
        try {
            Logger.info("Twitter Adapter :: handleIncomingRedisMessage", message);

            if (message.type !== 'SOCIAL' || !message.payload) {
                return;
            }

            switch (message.payload.type) {
                case 'tweet':
                    await this.client.sendStandardTweet(message.payload.text, '');
                    break;
                case 'reply':
                    if (message.payload.inReplyToId) {
                        await this.client.sendStandardTweet(message.payload.text, message.payload.inReplyToId);
                    }
                    break;
                default:
                    Logger.warn('Unknown message type:', message.payload.type);
            }
        } catch (error) {
            Logger.error('Error handling Redis message:', error);
        }
    }

    async start(): Promise<void> {
        try {
            await this.client.start();

            // Subscribe to outbound messages from other processes
            await this.redisClient.subscribe(REDIS_CHANNELS.SOCIAL_OUTBOUND, 
                async (message: RedisMessage) => {
                    if (message.source !== 'twitter') {
                        await this.handleIncomingRedisMessage(message);
                    }
            });

            // Set up event listeners for Twitter events
            if (this.client instanceof EventEmitter) {
                this.client.on('mention', (tweet: Tweet) => this.handleMention(tweet));
                this.client.on('reply', (tweet: Tweet) => this.handleReply(tweet));
            }

            Logger.info('Twitter adapter started successfully');
        } catch (error) {
            Logger.error('Failed to start Twitter adapter:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try {
            await this.client.stop();
            await this.redisClient.disconnect();
            Logger.info('Twitter adapter stopped');
        } catch (error) {
            Logger.error('Error stopping Twitter adapter:', error);
            throw error;
        }
    }
}
