import { FarcasterClient } from "./client";
import { FarcasterPostManager } from "./post";
import { FarcasterInteractionManager } from "./interactions";
import { Configuration, NeynarAPIClient } from "@neynar/nodejs-sdk";
import { validateFarcasterConfig, type FarcasterAdapterConfig } from "./environment";
import { EventEmitter } from 'events';
import { Logger, RedisClient, RedisMessage, REDIS_CHANNELS } from '@hiveai/utils';
import { v4 as uuid } from 'uuid';
import type { Cast } from './types';
import { setInterval } from 'timers';

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

    constructor(runtime: any, farcasterConfig: FarcasterAdapterConfig) {
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

export const FarcasterClientInterface: any = {
    async start(runtime: any) {
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

    async stop(runtime: any) {
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
    signerUuid: string;
    hubUrl: string;
    redis_url: string;
}

export class FarcasterAdapter extends EventEmitter {
    private client: FarcasterClient;
    private redisClient: RedisClient;
    private readonly config: FarcasterConfig;

    constructor(config: FarcasterConfig) {
        super();
        this.config = config;
        this.client = new FarcasterClient({
            runtime: {
                agentId: "farcaster-adapter",
                getSetting: () => undefined
            } as any,
            url: config.hubUrl,
            ssl: true,
            neynar: new NeynarAPIClient({ apiKey: config.apiKey }),
            signerUuid: config.signerUuid,
            cache: new Map(),
            farcasterConfig: {} as any
        });

        // Setup Redis client
        this.redisClient = new RedisClient({ url: config.redis_url });
    }

    private async handleCast(cast: Cast): Promise<void> {
        try {
            await this.redisClient.publish(REDIS_CHANNELS.SOCIAL_INBOUND, {
                id: uuid(),
                timestamp: Date.now(),
                type: 'SOCIAL',
                source: 'farcaster',
                payload: {
                    castId: cast.hash,
                    text: cast.text,
                    authorFid: cast.authorFid,
                    authorUsername: cast.profile.username,
                    authorName: cast.profile.name,
                    inReplyTo: cast.inReplyTo,
                    type: cast.inReplyTo ? 'reply' : 'cast'
                }
            });
            Logger.info('Published cast to Redis:', cast.hash);
        } catch (error) {
            Logger.error('Error publishing cast to Redis:', error);
        }
    }

    private async handleIncomingRedisMessage(message: RedisMessage): Promise<void> {
        try {
            Logger.info("Farcaster Adapter :: handleIncomingRedisMessage", message);

            if (message.type !== 'SOCIAL' || !message.payload) {
                return;
            }

            switch (message.payload.type) {
                case 'cast':
                    await this.client.cast(message.payload.text);
                    break;
                case 'reply':
                    if (message.payload.inReplyTo) {
                        await this.client.publishCast(
                            message.payload.text,
                            {
                                hash: message.payload.inReplyTo.hash,
                                fid: message.payload.inReplyTo.fid
                            }
                        );
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
            // Subscribe to Redis messages
            await this.redisClient.subscribe(REDIS_CHANNELS.SOCIAL_OUTBOUND, 
                async (message: RedisMessage) => {
                    if (message.source !== 'farcaster') {
                        await this.handleIncomingRedisMessage(message);
                    }
            });

            // Start monitoring mentions and timeline
            await this.client.connect();
            
            // Set up polling for new mentions and casts
            setInterval(async () => {
                try {
                    const agentFid = Number(this.config.username);
                    
                    // Check mentions
                    const mentions = await this.client.getMentions({
                        fid: agentFid,
                        pageSize: 10
                    });
                    
                    for (const mention of mentions) {
                        await this.handleCast(mention);
                    }

                    // Check timeline
                    const { timeline } = await this.client.getTimeline({
                        fid: agentFid,
                        pageSize: 10
                    });

                    for (const cast of timeline) {
                        await this.handleCast(cast);
                    }

                } catch (error) {
                    Logger.error('Error polling Farcaster:', error);
                }
            }, 60000); // Poll every minute

            Logger.info('Farcaster adapter started successfully');
        } catch (error) {
            Logger.error('Failed to start Farcaster adapter:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        await this.redisClient.disconnect();
        await this.client.disconnect();
        Logger.info('Farcaster adapter stopped');
    }
}
