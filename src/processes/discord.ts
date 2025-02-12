// processes/telegram.ts
import { DiscordAdapter } from '@hiveai/adapters-discord';
import { Logger } from '@hiveai/utils';

export async function startDiscord() {
    try {
        const config = {
            token: process.env.DISCORD_TOKEN!,
            guildId: process.env.DISCORD_GUILD_ID!,
            announcementChannelId: process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID!,
            alphaChannelId: process.env.DISCORD_ALPHA_CHANNEL_ID!,
            memeChannelId: process.env.DISCORD_MEME_CHANNEL_ID!,
            redis_url: process.env.REDIS_URL!
        };

        const adapter = new DiscordAdapter(config);

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
 

startDiscord().catch(error => {
    Logger.error('Unhandled error in Telegram process:', error);
    process.exit(1);
});