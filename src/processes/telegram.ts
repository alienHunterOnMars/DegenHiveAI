// processes/telegram.ts
import { TelegramAdapter } from '@hiveai/adapters-telegram';
import { Logger } from '@hiveai/utils';

export async function startTelegram() {
    try {
        // Log environment variables (without sensitive data)
        Logger.info('Starting Telegram process with config:', {
            hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
            groupChatId: process.env.TELEGRAM_GROUP_CHAT_ID,
            founderChatId: process.env.TELEGRAM_FOUNDER_CHAT_ID,
            hasRedisUrl: !!process.env.REDIS_URL
        });

        // Validate required environment variables
        if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');
        if (!process.env.TELEGRAM_GROUP_CHAT_ID) throw new Error('TELEGRAM_GROUP_CHAT_ID is required');
        if (!process.env.TELEGRAM_FOUNDER_CHAT_ID) throw new Error('TELEGRAM_FOUNDER_CHAT_ID is required');
        if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');

        const config = {
            token: process.env.TELEGRAM_BOT_TOKEN,
            communityChatId: process.env.TELEGRAM_GROUP_CHAT_ID,
            founderChatId: process.env.TELEGRAM_FOUNDER_CHAT_ID,
            redis_url: process.env.REDIS_URL
        };

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
        
        // Notify parent process that initialization is complete
        if (process.send) {
            process.send({ type: 'ready' });
        }
    } catch (error) {
        Logger.error('Failed to start Telegram process:', error);
        process.exit(1);
    }
}

startTelegram().catch(error => {
    Logger.error('Unhandled error in Telegram process:', error);
    process.exit(1);
});