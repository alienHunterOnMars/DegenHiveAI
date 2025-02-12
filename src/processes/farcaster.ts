// processes/telegram.ts
import { FarcasterAdapter } from '@hiveai/adapters-farcaster';
import { Logger } from '@hiveai/utils';

export async function startFarcaster() {
    try {
        const config = {
            apiKey: process.env.FARCASTER_NEYNAR_API_KEY!,
            username: process.env.FARCASTER_USERNAME!,
            signerUuid: process.env.FARCASTER_NEYNAR_SIGNER_UUID!,
            hubUrl: process.env.FARCASTER_HUB_URL || 'hub.pinata.cloud',
            redis_url: process.env.REDIS_URL!
        };

        const adapter = new FarcasterAdapter(config);

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
        Logger.info('Farcaster process started successfully');
    } catch (error) {
        Logger.error('Failed to start Farcaster process:', error);
        process.exit(1);
    }
}

startFarcaster().catch(error => {
    Logger.error('Unhandled error in Farcaster process:', error);
    process.exit(1);
});