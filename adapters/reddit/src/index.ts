import type { Comment, PrivateMessage, Submission } from 'snoowrap';
import Snoowrap from 'snoowrap';
import { EventEmitter } from 'events';
import { Logger, RedisClient, RedisMessage, REDIS_CHANNELS } from '@hiveai/utils';
import { v4 as uuid } from 'uuid';
import { RedditMessageHandler } from './handlers/messageHandler';
import { RedditPostHandler } from './handlers/postHandler';
import { RedditConfig, RedditPost } from './types';

export class RedditAdapter extends EventEmitter {
    private static readonly POLLING_INTERVAL = 60000; // 1 minute
    private static readonly REQUEST_DELAY = 2000; // 2 seconds between requests
    private static readonly MAX_ITEMS_PER_REQUEST = 20;
    private lastPollTimestamps = {
        messages: 0,
        mentions: 0,
        subreddits: 0
    };

    private client: Snoowrap;
    private messageHandler: RedditMessageHandler;
    private postHandler: RedditPostHandler;
    private config: RedditConfig;
    private redisClient: RedisClient;
    private pollInterval!: NodeJS.Timeout;

    constructor(config: RedditConfig) {
        super();
        this.config = config;

        // Initialize Reddit client with conservative rate limits
        this.client = new Snoowrap({
            userAgent: config.userAgent,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            username: config.username,
            password: config.password
        });

        // Initialize Redis client
        this.redisClient = new RedisClient({ url: config.redis_url });

        // Initialize handlers
        this.messageHandler = new RedditMessageHandler(this.client);
        this.postHandler = new RedditPostHandler(this.client);

        // Configure client with conservative rate limits
        this.client.config({
            requestDelay: 2000, // 2 seconds between requests
            maxRetryAttempts: 3,
            continueAfterRatelimitError: true,
            retryErrorCodes: [502, 503, 504, 522],
            debug: process.env.NODE_ENV === 'development'
        });
    }
 
 
    private async handleRedditPost(post: Submission): Promise<void> {
        try {
            await this.redisClient.publish(REDIS_CHANNELS.SOCIAL_INBOUND, {
                id: uuid(),
                timestamp: Date.now(),
                type: 'INTERNAL',
                destination: 'reddit',
                source: 'reddit',
                payload: {
                    postId: post.id,
                    subreddit: post.subreddit.display_name,
                    title: post.title,
                    text: post.selftext,
                    author: post.author.name,
                    type: 'post'
                }
            });
            Logger.info('Published Reddit post to Redis:', post.id);
        } catch (error) {
            Logger.error('Error publishing Reddit post to Redis:', error);
        }
    }

    private async handleRedditComment(comment: Comment): Promise<void> {
        try {
            await this.redisClient.publish(REDIS_CHANNELS.SOCIAL_INBOUND, {
                id: uuid(),
                timestamp: Date.now(),
                type: 'INTERNAL',
                destination: 'reddit',
                source: 'reddit',
                payload: {
                    commentId: comment.id,
                    postId: comment.link_id,
                    text: comment.body,
                    author: comment.author.name,
                    subreddit: comment.subreddit.display_name,
                    type: 'comment'
                }
            });
            Logger.info('Published Reddit comment to Redis:', comment.id);
        } catch (error) {
            Logger.error('Error publishing Reddit comment to Redis:', error);
        }
    }

    private async handleRedditMessage(message: PrivateMessage): Promise<void> {
        try {
            await this.redisClient.publish(REDIS_CHANNELS.SOCIAL_INBOUND, {
                id: uuid(),
                timestamp: Date.now(),
                type: 'INTERNAL',
                destination: 'reddit',
                source: 'reddit',
                payload: {
                    messageId: message.id,
                    text: message.body,
                    author: message.author.name,
                    type: 'message'
                }
            });
            Logger.info('Published Reddit message to Redis:', message.id);
        } catch (error) {
            Logger.error('Error publishing Reddit message to Redis:', error);
        }
    }

    private async handleIncomingRedisMessage(message: RedisMessage): Promise<void> {
        try {
            Logger.info("Reddit Adapter :: handleIncomingRedisMessage", message);

            if (message.type !== 'INTERNAL' || !message.payload) {
                return;
            }

            switch (message.payload.type) {
                case 'post':
                    await this.postHandler.submitPost({
                        subreddit: message.payload.subreddit,
                        title: message.payload.title || 'New Post',
                        content: message.payload.text,
                        type: 'text'
                    });
                    break;
                case 'comment':
                    if (message.payload.postId) {
                        await this.replyToComment(message.payload.postId, message.payload.text);
                    }
                    break;
                case 'message':
                    // Handle private messages if needed
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
     
            // Subscribe to Redis messages
            await this.redisClient.subscribe(REDIS_CHANNELS.SOCIAL_OUTBOUND, 
                async (message: RedisMessage) => {
                    if (message.source !== 'reddit') {
                        await this.handleIncomingRedisMessage(message);
                    }
            });

            // Verify credentials
            const me = await Promise.resolve(this.client.getMe() as any);
            Logger.info(`Reddit bot logged in as u/${me.name}`);

            // Start polling for new messages and mentions
            this.startPolling();

            Logger.info('Reddit adapter started successfully');
        } catch (error) {
            Logger.error('Failed to start Reddit adapter:', error);
            throw error;
        }
    }

    private startPolling(): void {
        // Instead of running all tasks together, stagger them
        setInterval(() => this.checkNewMessages(), RedditAdapter.POLLING_INTERVAL);
        setInterval(() => this.checkMentions(), RedditAdapter.POLLING_INTERVAL + 20000); // Offset by 20 seconds
        setInterval(() => this.checkSubredditActivity(), RedditAdapter.POLLING_INTERVAL + 40000); // Offset by 40 seconds
    }

    async submitPost(
        subreddit: string,
        title: string,
        content: string,
        type: 'text' | 'link' = 'text'
    ): Promise<void> {
        await this.postHandler.submitPost({
            subreddit,
            title,
            content,
            type
        });
    }

    async replyToComment(commentId: string, response: string): Promise<void> {
        try {
            const comment = await Promise.resolve(this.client.getComment(commentId) as any);
            await comment.reply(response);
            Logger.info(`Replied to comment ${commentId}`);
        } catch (error) {
            Logger.error('Error replying to comment:', error);
            throw error;
        }
    }

    private async checkNewMessages(): Promise<void> {
        if (Date.now() - this.lastPollTimestamps.messages < RedditAdapter.POLLING_INTERVAL) {
            return; // Prevent overlapping polls
        }

        try {
            this.lastPollTimestamps.messages = Date.now();
            const messages = await this.client.getUnreadMessages({ limit: RedditAdapter.MAX_ITEMS_PER_REQUEST });
            
            // Process messages sequentially with delay
            for (const message of messages) {
                await this.messageHandler.handleMessage(message);
                await this.handleRedditMessage(message);
                await this.sleep(RedditAdapter.REQUEST_DELAY);
            }

            if (messages.length > 0) {
                await this.sleep(RedditAdapter.REQUEST_DELAY);
                await this.client.markMessagesAsRead(messages);
            }

        } catch (error) {
            if (this.isRateLimitError(error)) {
                Logger.warn('Rate limit reached in checkNewMessages, waiting before retry');
                await this.sleep(60000); // Wait a minute before retrying
            } else {
                Logger.error('Error checking messages:', error);
            }
        }
    }

    private async checkMentions(): Promise<void> {
        if (Date.now() - this.lastPollTimestamps.mentions < RedditAdapter.POLLING_INTERVAL) {
            return;
        }

        try {
            this.lastPollTimestamps.mentions = Date.now();
            const messages = await this.client.getUnreadMessages({ limit: RedditAdapter.MAX_ITEMS_PER_REQUEST });
            
            const mentions = (messages as any[]).filter(
                (message): message is Comment => 
                    message.was_comment &&
                    'body' in message && 
                    'author' in message && 
                    'parent_id' in message
            );

            // Process mentions sequentially with delay
            for (const mention of mentions) {
                await this.messageHandler.handleMention(mention);
                await this.handleRedditComment(mention);
                await this.sleep(RedditAdapter.REQUEST_DELAY);
            }

        } catch (error) {
            if (this.isRateLimitError(error)) {
                Logger.warn('Rate limit reached in checkMentions, waiting before retry');
                await this.sleep(60000);
            } else {
                Logger.error('Error checking mentions:', error);
            }
        }
    }

    private async checkSubredditActivity(): Promise<void> {
        if (Date.now() - this.lastPollTimestamps.subreddits < RedditAdapter.POLLING_INTERVAL) {
            return;
        }

        try {
            this.lastPollTimestamps.subreddits = Date.now();
            
            // Process each subreddit sequentially
            for (const subreddit of this.config.monitoredSubreddits) {
                await this.sleep(RedditAdapter.REQUEST_DELAY);
                
                const newPosts = await this.client
                    .getSubreddit(subreddit)
                    .getNew({ limit: RedditAdapter.MAX_ITEMS_PER_REQUEST });
                
                // Process posts sequentially with delay
                for (const post of newPosts) {
                    await this.postHandler.handleNewPost(post);
                    await this.handleRedditPost(post);
                    await this.sleep(RedditAdapter.REQUEST_DELAY);
                }
            }

        } catch (error) {
            if (this.isRateLimitError(error)) {
                Logger.warn('Rate limit reached in checkSubredditActivity, waiting before retry');
                await this.sleep(60000);
            } else {
                Logger.error('Error checking subreddit activity:', error);
            }
        }
    }

    private isRateLimitError(error: any): boolean {
        return error?.message?.includes('RATELIMIT') || 
               error?.statusCode === 429 ||
               error?.error === 'TOO_MANY_REQUESTS';
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async stop(): Promise<void> {
        await this.redisClient.disconnect();
        clearInterval(this.pollInterval);
        this.lastPollTimestamps = { messages: 0, mentions: 0, subreddits: 0 };
        Logger.info('Reddit adapter stopped');
    }
} 