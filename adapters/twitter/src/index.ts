import { type Client, type IAgentRuntime } from "@hiveai/core";
import { ClientBase } from "./base";
import { validateTwitterConfig, type TwitterConfig } from "./environment";
import { TwitterInteractionClient } from "./interactions";
import { TwitterPostClient } from "./post";
import { TwitterSearchClient } from "./search";
import { TwitterSpaceClient } from "./spaces";
import { EventEmitter } from 'events';
import { Logger } from '@hiveai/utils';
import { MessageBroker, CrossClientMessage } from '@hiveai/messaging';

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
    search: TwitterSearchClient;
    interaction: TwitterInteractionClient;
    space?: TwitterSpaceClient;
    private messageBroker?: MessageBroker;

    constructor(runtime: IAgentRuntime, twitterConfig: TwitterConfig) {
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

        // Initialize RabbitMQ if config provided
        if (twitterConfig.messageBroker) {
            this.messageBroker = new MessageBroker({
                url: twitterConfig.messageBroker.url,
                exchange: twitterConfig.messageBroker.exchange,
                clientId: 'twitter'
            });
            this.setupMessageBroker();
        }
    }

    private setupMessageBroker(): void {
        if (!this.messageBroker) return;
        this.messageBroker.on('message', this.handleCrossClientMessage.bind(this));
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
        // Optionally create tweets from cross-platform messages
        if (message.payload.content && this.shouldTweet(message)) {
            await this.client.tweet(message.payload.content);
        }
    }

    private shouldTweet(message: CrossClientMessage): boolean {
        // Implement logic to determine if a cross-platform message should be tweeted
        return false;
    }

    private async handleAlert(message: CrossClientMessage): Promise<void> {
        // Handle platform-wide alerts
    }

    private async handleNotification(message: CrossClientMessage): Promise<void> {
        // Handle cross-platform notifications
    }

    private async handleCommand(message: CrossClientMessage): Promise<void> {
        // Handle cross-platform commands
    }
}

export const TwitterClientInterface: Client = {
    async start(runtime: IAgentRuntime): Promise<TwitterManager> {
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

    async stop(_runtime: IAgentRuntime) {
        Logger.warn("Twitter client does not support stopping yet");
    },
};

export default TwitterClientInterface;

export class TwitterAdapter extends EventEmitter {
    private client: TwitterClient;
    private messageBroker?: MessageBroker;
    private readonly config: TwitterConfig;

    constructor(config: TwitterConfig) {
        super();
        this.config = config;
        this.client = new TwitterClient(config);

        // Initialize RabbitMQ if config provided
        if (config.messageBroker) {
            this.messageBroker = new MessageBroker({
                url: config.messageBroker.url,
                exchange: config.messageBroker.exchange,
                clientId: 'twitter'
            });
            this.setupMessageBroker();
        }
    }

    private setupMessageBroker(): void {
        if (!this.messageBroker) return;
        this.messageBroker.on('message', this.handleCrossClientMessage.bind(this));
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
        // Optionally create tweets from cross-platform messages
        if (message.payload.content && this.shouldTweet(message)) {
            await this.client.tweet(message.payload.content);
        }
    }

    private shouldTweet(message: CrossClientMessage): boolean {
        // Implement logic to determine if a cross-platform message should be tweeted
        return false;
    }

    private async handleAlert(message: CrossClientMessage): Promise<void> {
        // Handle platform-wide alerts
    }

    private async handleNotification(message: CrossClientMessage): Promise<void> {
        // Handle cross-platform notifications
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

            await this.client.start();
            Logger.info('Twitter adapter started successfully');
        } catch (error) {
            Logger.error('Failed to start Twitter adapter:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.messageBroker) {
            await this.messageBroker.disconnect();
        }
        await this.client.stop();
        Logger.info('Twitter adapter stopped');
    }

    async broadcastMessage(content: string): Promise<void> {
        if (!this.messageBroker) return;

        await this.messageBroker.publish({
            source: 'twitter',
            type: 'MESSAGE',
            payload: {
                content,
                timestamp: Date.now()
            }
        });
    }
}
