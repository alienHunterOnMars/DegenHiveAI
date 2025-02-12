// processes/telegram.ts
import { EmailAdapter } from '@hiveai/adapters-email';
import { Logger } from '@hiveai/utils';

export async function startEmail() {
    try {
        const config = {
            smtp: {
                host: process.env.SMTP_HOST!,
                port: parseInt(process.env.SMTP_PORT!),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER!,
                    pass: process.env.SMTP_PASSWORD!
                }
            },
            imap: {
                host: process.env.IMAP_HOST!,
                port: parseInt(process.env.IMAP_PORT!),
                tls: process.env.IMAP_TLS === 'true',
                auth: {
                    user: process.env.IMAP_USER!,
                    pass: process.env.IMAP_PASSWORD!
                }
            },
            redis_url: process.env.REDIS_URL!
        };

        const adapter = new EmailAdapter(config);

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
        Logger.info('Email process started successfully');
    } catch (error) {
        Logger.error('Failed to start Email process:', error);
        process.exit(1);
    }
}
 

startEmail().catch(error => {
    Logger.error('Unhandled error in Email process:', error);
    process.exit(1);
});