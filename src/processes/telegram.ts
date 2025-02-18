// processes/telegram.ts
import { TelegramAdapter } from '@hiveai/adapters-telegram';
import { Logger } from '@hiveai/utils';

export async function startTelegram() {
    try {
        const config = {
            token: process.env.TELEGRAM_BOT_TOKEN!,
            communityChatId: process.env.TELEGRAM_GROUP_CHAT_ID!,
            founderChatId: process.env.TELEGRAM_FOUNDER_CHAT_ID!,
            redis_url: process.env.REDIS_URL!
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
    } catch (error) {
        Logger.error('Failed to start Telegram process:', error);
        process.exit(1);
    }
}
 

startTelegram().catch(error => {
    Logger.error('Unhandled error in Telegram process:', error);
    process.exit(1);
});