// processes/telegram.ts
import { Logger } from '@hiveai/utils';
import { TwitterAdapter } from '@hiveai/adapters-twitter';

export async function startTwitter() {
    try {
        const config = {
            apiKey: process.env.TWITTER_API_KEY!,
            apiSecret: process.env.TWITTER_API_SECRET!,
            accessToken: process.env.TWITTER_ACCESS_TOKEN!,
            accessSecret: process.env.TWITTER_ACCESS_SECRET!,
            bearerToken: process.env.TWITTER_BEARER_TOKEN!,
            redis_url: process.env.REDIS_URL!
        };

        const adapter = new TwitterAdapter(config);

        // Handle graceful shutdown
        process.on('SIGTERM', async () => {
            await adapter.stop();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            await adapter.stop();
            process.exit(0);
        });

        await adapter.start();
        Logger.info('Twitter process started successfully');
    } catch (error) {
        Logger.error('Failed to start Twitter process:', error);
        process.exit(1);
    }
}

startTwitter().catch(error => {
    Logger.error('Unhandled error in Twitter process:', error);
    process.exit(1);
});
