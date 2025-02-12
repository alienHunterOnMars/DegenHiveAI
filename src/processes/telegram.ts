// processes/telegram.ts
import { TelegramAdapter } from '@hiveai/adapters-telegram';
import { Logger } from '@hiveai/utils';

async function main(config: any) {
    try {
        const adapter = new TelegramAdapter(config);

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
        Logger.info('Telegram process started successfully');
    } catch (error) {
        Logger.error('Failed to start Telegram process:', error);
        process.exit(1);
    }
}

main().catch(error => {
    Logger.error('Unhandled error in Telegram process:', error);
    process.exit(1);
});