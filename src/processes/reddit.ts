// processes/telegram.ts
import { RedditAdapter } from '@hiveai/adapters-reddit';
import { Logger } from '@hiveai/utils';

export async function startReddit() {
    try {
        const config = {
            userAgent: process.env.REDDIT_USER_AGENT!,
            clientId: process.env.REDDIT_CLIENT_ID!,
            clientSecret: process.env.REDDIT_CLIENT_SECRET!,
            username: process.env.REDDIT_USERNAME!,
            password: process.env.REDDIT_PASSWORD!,
            refreshToken: process.env.REDDIT_REFRESH_TOKEN!,
            monitoredSubreddits: process.env.REDDIT_MONITORED_SUBREDDITS ? process.env.REDDIT_MONITORED_SUBREDDITS.split(',') : [],
            autoReplyEnabled: process.env.REDDIT_AUTO_REPLY_ENABLED === 'true',
            postApprovalRequired: process.env.REDDIT_POST_APPROVAL_REQUIRED === 'true',
            redis_url: process.env.REDIS_URL!
        };

        const adapter = new RedditAdapter(config);

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
        Logger.info('Reddit process started successfully');
    } catch (error) {
        Logger.error('Failed to start Reddit process:', error);
        process.exit(1);
    }
}
 

startReddit().catch(error => {
    Logger.error('Unhandled error in Reddit process:', error);
    process.exit(1);
});