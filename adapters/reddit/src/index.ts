import type { Comment, PrivateMessage, Submission } from 'snoowrap';
import Snoowrap from 'snoowrap';
import { EventEmitter } from 'events';
import { Logger } from '@hiveai/utils';
import { MessageBroker, CrossClientMessage } from '@hiveai/messaging';
import { RedditMessageHandler } from './handlers/messageHandler';
import { RedditPostHandler } from './handlers/postHandler';
import { RedditConfig, RedditPost } from './types';

export class RedditAdapter extends EventEmitter {
    private client: Snoowrap;
    private messageHandler: RedditMessageHandler;
    private postHandler: RedditPostHandler;
    private config: RedditConfig;
    private messageBroker?: MessageBroker;
    private pollInterval!: NodeJS.Timeout;

    constructor(config: RedditConfig) {
        super();
        this.config = config;

        // Initialize Reddit client
        this.client = new Snoowrap({
            userAgent: 'DragonbeeBot/1.0.0',
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            refreshToken: config.refreshToken
        });

        // Initialize handlers
        this.messageHandler = new RedditMessageHandler(this.client);
        this.postHandler = new RedditPostHandler(this.client);

        // Configure client
        this.client.config({
            requestDelay: 1000, // Respect rate limits
            continueAfterRatelimitError: true,
            retryErrorCodes: [502, 503, 504, 522]
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
        this.pollInterval = setInterval(async () => {
            try {
                const tasks = [
                    this.checkNewMessages(),
                    this.checkMentions(),
                    this.checkSubredditActivity()
                ];
                await Promise.all(tasks);
            } catch (error) {
                Logger.error('Error in Reddit polling:', error);
            }
        }, 30000); // Poll every 30 seconds
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
        try {
            const messages = await (async () => this.client.getUnreadMessages())();
            for (const message of messages) {
                await this.messageHandler.handleMessage(message);
            }
            await this.client.markMessagesAsRead(messages);
        } catch (error) {
            Logger.error('Error checking messages:', error);
        }
    }

    private async checkMentions(): Promise<void> {
        try {
            const messages = await (async () => this.client.getUnreadMessages())() as (Comment | PrivateMessage)[];
            const mentions = messages.filter(
                (message): message is Comment => 'body' in message && 'author' in message && 'parent_id' in message
            );
            for (const mention of mentions) {
                await this.messageHandler.handleMention(mention);
            }
        } catch (error) {
            Logger.error('Error checking mentions:', error);
        }
    }

    private async checkSubredditActivity(): Promise<void> {
        try {
            for (const subreddit of this.config.monitoredSubreddits) {
                const newPosts = await this.client
                    .getSubreddit(subreddit)
                    .getNew({ limit: 25 });
                
                for (const post of newPosts) {
                    await this.postHandler.handleNewPost(post);
                }
            }
        } catch (error) {
            Logger.error('Error checking subreddit activity:', error);
        }
    }

    async stop(): Promise<void> {
        if (this.messageBroker) {
            await this.messageBroker.disconnect();
        }
        clearInterval(this.pollInterval);
        Logger.info('Reddit adapter stopped');
    }

 
} 