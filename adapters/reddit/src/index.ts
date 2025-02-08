import type { Comment, PrivateMessage, Submission } from 'snoowrap';
import Snoowrap from 'snoowrap';
import { EventEmitter } from 'events';
import { Logger } from '@hiveai/utils';
import { MessageBroker, CrossClientMessage } from '@hiveai/messaging';
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
    private messageBroker?: MessageBroker;
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

    private async handleCrossClientMessage(message: CrossClientMessage): Promise<void> {
        if (!this.messageBroker) return;

        try {
            switch (message.type) {
                case 'MESSAGE':
                    await this.handleIncomingMessage(message);
                    break;
                case 'ALERT':
                    await this.handleAlert(message);
                    break;
                case 'NOTIFICATION':
                    await this.handleNotification(message);
                    break;
                case 'COMMAND':
                    await this.handleCommand(message);
                    break;
            }
        } catch (error) {
            Logger.error('Error handling cross-client message:', error);
        }
    }

    private async handleIncomingMessage(message: CrossClientMessage): Promise<void> {
        // Handle cross-platform messages, maybe post to specific subreddits
    }

    private async handleAlert(message: CrossClientMessage): Promise<void> {
        // Handle alerts from other platforms
    }

    private async handleNotification(message: CrossClientMessage): Promise<void> {
        // Handle notifications from other platforms
    }

    private async handleCommand(message: CrossClientMessage): Promise<void> {
        // Handle cross-platform commands
    }

    async start(): Promise<void> {
        try {
            // Connect to RabbitMQ if configured
            if (this.messageBroker) {
                await this.messageBroker.connect();
            }

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
            
            const mentions = messages.filter(
                (message): message is any => 
                    'body' in message && 
                    'author' in message && 
                    'parent_id' in message
            );

            // Process mentions sequentially with delay
            for (const mention of mentions) {
                await this.messageHandler.handleMention(mention as any);
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
        if (this.messageBroker) {
            await this.messageBroker.disconnect();
        }
        clearInterval(this.pollInterval);
        this.lastPollTimestamps = { messages: 0, mentions: 0, subreddits: 0 };
        Logger.info('Reddit adapter stopped');
    }
} 