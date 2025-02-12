// processes/telegram.ts
import { TwitterAdapter, ActionTimelineType } from '@hiveai/adapters-twitter';
import { Logger } from '@hiveai/utils';

export async function startTwitter() {
    try {
        const config = {
            TWITTER_DRY_RUN: process.env.TWITTER_DRY_RUN === 'true',
            TWITTER_USERNAME: process.env.TWITTER_USERNAME!,
            TWITTER_PASSWORD: process.env.TWITTER_PASSWORD!,
            TWITTER_EMAIL: process.env.TWITTER_EMAIL!,
            MAX_TWEET_LENGTH: Number(process.env.MAX_TWEET_LENGTH || 280),
            TWITTER_SEARCH_ENABLE: process.env.TWITTER_SEARCH_ENABLE === 'true',
            TWITTER_2FA_SECRET: process.env.TWITTER_2FA_SECRET!,
            TWITTER_RETRY_LIMIT: Number(process.env.TWITTER_RETRY_LIMIT || 3),
            TWITTER_POLL_INTERVAL: Number(process.env.TWITTER_POLL_INTERVAL || 60),
            TWITTER_TARGET_USERS: process.env.TWITTER_TARGET_USERS ? process.env.TWITTER_TARGET_USERS.split(',') : [],
            REDIS_URL: process.env.REDIS_URL!,
            POST_INTERVAL_MIN: Number(process.env.POST_INTERVAL_MIN || 30),
            POST_INTERVAL_MAX: Number(process.env.POST_INTERVAL_MAX || 120),
            ENABLE_ACTION_PROCESSING: process.env.ENABLE_ACTION_PROCESSING === 'true',
            ACTION_INTERVAL: Number(process.env.ACTION_INTERVAL || 5),
            POST_IMMEDIATELY: process.env.POST_IMMEDIATELY === 'true',
            TWITTER_SPACES_ENABLE: process.env.TWITTER_SPACES_ENABLE === 'true',
            TWITTER_SPACES_INTERVAL: Number(process.env.TWITTER_SPACES_INTERVAL || 60),
            MAX_ACTIONS_PROCESSING: Number(process.env.MAX_ACTIONS_PROCESSING || 10),
            ACTION_TIMELINE_TYPE: process.env.ACTION_TIMELINE_TYPE as ActionTimelineType || ActionTimelineType.ForYou,
            messageBroker: process.env.MESSAGE_BROKER ? { 
                url: process.env.MESSAGE_BROKER,
                exchange: process.env.MESSAGE_BROKER_EXCHANGE || 'twitter'
            } : undefined
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
