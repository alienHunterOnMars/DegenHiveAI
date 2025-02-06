import Snoowrap from 'snoowrap';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import { RedditMessageHandler } from './src/handlers/messageHandler';
import { RedditPostHandler } from './handlers/postHandler';
import { RedditConfig, RedditPost } from './types';
import { TelegramAdapter } from '@hiveai/adapters-telegram';

export class RedditAdapter extends EventEmitter {
    private client: Snoowrap;
    private messageHandler: RedditMessageHandler;
    private postHandler: RedditPostHandler;
    private config: RedditConfig;
    private telegramAdapter: TelegramAdapter;
    private pollInterval: NodeJS.Timeout;

    constructor(config: RedditConfig, telegramAdapter: TelegramAdapter) {
        super();
        this.config = config;
        this.telegramAdapter = telegramAdapter;

        // Initialize Reddit client
        this.client = new Snoowrap({
            userAgent: 'DragonbeeBot/1.0.0',
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            refreshToken: config.refreshToken
        });

        // Initialize handlers
        this.messageHandler = new RedditMessageHandler(this.client);
        this.postHandler = new RedditPostHandler(this.client, this.telegramAdapter);

        // Configure client
        this.client.config({
            requestDelay: 1000, // Respect rate limits
            continueAfterRatelimitError: true,
            retryErrorCodes: [502, 503, 504, 522]
        });
    }

    async start(): Promise<void> {
        try {
            // Verify credentials
            const me = await this.client.getMe();
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
                await this.checkNewMessages();
                await this.checkMentions();
                await this.checkSubredditActivity();
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
            const comment = await this.client.getComment(commentId);
            await comment.reply(response);
            Logger.info(`Replied to comment ${commentId}`);
        } catch (error) {
            Logger.error('Error replying to comment:', error);
            throw error;
        }
    }

    private async checkNewMessages(): Promise<void> {
        try {
            const messages = await this.client.getUnreadMessages();
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
            const mentions = await this.client.getNewMentions();
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
        clearInterval(this.pollInterval);
        Logger.info('Reddit adapter stopped');
    }
} 