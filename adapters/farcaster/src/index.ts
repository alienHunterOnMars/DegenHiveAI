import { type Client, type IAgentRuntime } from "@hiveai/core";
import { FarcasterClient } from "./client";
import { FarcasterPostManager } from "./post";
import { FarcasterInteractionManager } from "./interactions";
import { Configuration, NeynarAPIClient } from "@neynar/nodejs-sdk";
import { validateFarcasterConfig, type FarcasterAdapterConfig } from "./environment";
import { EventEmitter } from 'events';
import { Logger } from '@hiveai/utils';
import { MessageBroker, CrossClientMessage } from '@hiveai/messaging';

/**
 * A manager that orchestrates all Farcaster operations:
 * - client: base operations (Neynar client, hub connection, etc.)
 * - posts: autonomous posting logic
 * - interactions: handling mentions, replies, likes, etc.
 */
class FarcasterManager {
    client: FarcasterClient;
    posts: FarcasterPostManager;
    interactions: FarcasterInteractionManager;
    private signerUuid: string;

    constructor(runtime: IAgentRuntime, farcasterConfig: FarcasterAdapterConfig) {
        const cache = new Map<string, any>();
        this.signerUuid = runtime.getSetting("FARCASTER_NEYNAR_SIGNER_UUID")!;

        const neynarConfig = new Configuration({
            apiKey: runtime.getSetting("FARCASTER_NEYNAR_API_KEY")!,
        });

        const neynarClient = new NeynarAPIClient(neynarConfig);

        this.client = new FarcasterClient({
            runtime,
            ssl: true,
            url: runtime.getSetting("FARCASTER_HUB_URL") ?? "hub.pinata.cloud",
            neynar: neynarClient,
            signerUuid: this.signerUuid,
            cache,
            farcasterConfig,
        });

        Logger.success("Farcaster Neynar client initialized.");

        this.posts = new FarcasterPostManager(
            this.client,
            runtime,
            this.signerUuid,
            cache
        );

        this.interactions = new FarcasterInteractionManager(
            this.client,
            runtime,
            this.signerUuid,
            cache
        );
    }

    async start() {
        await Promise.all([this.posts.start(), this.interactions.start()]);
    }

    async stop() {
        await Promise.all([this.posts.stop(), this.interactions.stop()]);
    }
}

export const FarcasterClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        const farcasterConfig = await validateFarcasterConfig(runtime);

        Logger.log("Farcaster client started");

        const manager = new FarcasterManager(runtime, farcasterConfig);

        // Start all services
        await manager.start();
        if (runtime.clients) {
            runtime.clients.farcaster = manager;
        }
        return manager;
    },

    async stop(runtime: IAgentRuntime) {
        try {
            // stop it
            Logger.log("Stopping farcaster client", runtime.agentId);
            if (runtime.clients?.farcaster) {
                await runtime.clients.farcaster.stop();
            }
        } catch (e) {
            Logger.error("client-farcaster interface stop error", e);
        }
    },
};

export default FarcasterClientInterface;

export interface FarcasterConfig {
    apiKey: string;
    username: string;
    messageBroker?: {
        url: string;
        exchange: string;
    };
}

export class FarcasterAdapter extends EventEmitter {
    private client: FarcasterClient;
    private messageBroker?: MessageBroker;
    private readonly config: FarcasterConfig;

    constructor(config: FarcasterConfig) {
        super();
        this.config = config;
        this.client = new FarcasterClient({
            runtime: {
                agentId: "farcaster-adapter",
                getSetting: () => undefined
            } as IAgentRuntime,
            url: "hub.pinata.cloud",
            ssl: true,
            neynar: new NeynarAPIClient({ apiKey: config.apiKey }),
            signerUuid: "",
            cache: new Map(),
            farcasterConfig: {} as any
        });

        // Initialize RabbitMQ if config provided
        if (config.messageBroker) {
            this.messageBroker = new MessageBroker({
                url: config.messageBroker.url,
                exchange: config.messageBroker.exchange,
                clientId: 'farcaster'
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
        // Handle cross-platform messages, maybe create casts
        if (message.payload.content && this.shouldCast(message)) {
            await this.client.cast(message.payload.content);
        }
    }

    private shouldCast(message: CrossClientMessage): boolean {
        // Implement logic to determine if a cross-platform message should be cast
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

            await this.client.connect();
            Logger.info('Farcaster adapter started successfully');
        } catch (error) {
            Logger.error('Failed to start Farcaster adapter:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.messageBroker) {
            await this.messageBroker.disconnect();
        }
        await this.client.disconnect();
        Logger.info('Farcaster adapter stopped');
    }
 
}
