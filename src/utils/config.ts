import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Loads and validates the application configuration from environment variables
 */
export function loadConfig(): any {

    return { }
    // return {
    //     discord: process.env.DISCORD_TOKEN ? {
    //         token: process.env.DISCORD_TOKEN,
    //         clientId: process.env.DISCORD_CLIENT_ID,
    //         clientSecret: process.env.DISCORD_CLIENT_SECRET
    //     } : undefined,

    //     telegram: process.env.TELEGRAM_TOKEN ? {
    //         token: process.env.TELEGRAM_TOKEN,
    //         webhookUrl: process.env.TELEGRAM_WEBHOOK_URL
    //     } : undefined,

    //     reddit: process.env.REDDIT_CLIENT_ID ? {
    //         clientId: process.env.REDDIT_CLIENT_ID,
    //         clientSecret: process.env.REDDIT_CLIENT_SECRET
    //     } : undefined,

    //     twitter: process.env.TWITTER_API_KEY ? {
    //         apiKey: process.env.TWITTER_API_KEY,
    //         apiSecret: process.env.TWITTER_API_SECRET,
    //         accessToken: process.env.TWITTER_ACCESS_TOKEN,
    //         accessSecret: process.env.TWITTER_ACCESS_SECRET
    //     } : undefined,

    //     farcaster: process.env.FARCASTER_TOKEN ? {
    //         token: process.env.FARCASTER_TOKEN
    //     } : undefined,

    //     email: process.env.EMAIL_API_KEY ? {
    //         apiKey: process.env.EMAIL_API_KEY,
    //         fromAddress: process.env.EMAIL_FROM_ADDRESS
    //     } : undefined,

    //     infrastructure: {
    //         kafka: {
    //             clientId: process.env.KAFKA_CLIENT_ID || 'hive-swarm',
    //             brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    //             maxRetries: parseInt(process.env.KAFKA_MAX_RETRIES || '5')
    //         },
    //         redis: {
    //             host: process.env.REDIS_HOST || 'localhost',
    //             port: parseInt(process.env.REDIS_PORT || '6379'),
    //             password: process.env.REDIS_PASSWORD,
    //             db: parseInt(process.env.REDIS_DB || '0')
    //         }
    //     },

    //     sharding: {
    //         enabled: process.env.SHARDING_ENABLED === 'true',
    //         totalShards: process.env.TOTAL_SHARDS ? parseInt(process.env.TOTAL_SHARDS) : undefined,
    //         shardId: process.env.SHARD_ID
    //     },

    //     plugins: {
    //         enabled: process.env.ENABLED_PLUGINS?.split(',') || [],
    //         config: {
    //             // Plugin-specific configurations can be added here
    //             // Example: solana: { rpcUrl: process.env.SOLANA_RPC_URL }
    //         }
    //     }
    // };
} 