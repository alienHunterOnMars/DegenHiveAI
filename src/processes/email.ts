// processes/telegram.ts
import { EmailAdapter } from '@hiveai/adapters-email';
import { Logger } from '@hiveai/utils';

export async function startEmail() {
    try {
        Logger.info('=== Starting Email Process Initialization ===');
        
        // Log environment variables (without sensitive data)
        Logger.info('Email process config:', {
            hasSmtpConfig: !!process.env.SMTP_HOST,
            hasImapConfig: !!process.env.IMAP_HOST,
            hasSendGridKey: !!process.env.SENDGRID_API_KEY,
            hasRedisUrl: !!process.env.REDIS_URL,
            webhookPort: process.env.EMAIL_WEBHOOK_PORT
        });

        // Validate required environment variables
        Logger.info('Validating environment variables...');
        if (!process.env.SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY is required');
        if (!process.env.SENDGRID_SIGNING_SECRET) throw new Error('SENDGRID_SIGNING_SECRET is required');
        if (!process.env.EMAIL_WEBHOOK_PORT) throw new Error('EMAIL_WEBHOOK_PORT is required');
        if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');
        Logger.info('Environment variables validated successfully');

        Logger.info('Creating EmailAdapter configuration...');
        const config = {
            SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
            SENDGRID_SIGNING_SECRET: process.env.SENDGRID_SIGNING_SECRET,
            WEBHOOK_PORT: parseInt(process.env.EMAIL_WEBHOOK_PORT),
            imap: {
                host: process.env.IMAP_HOST!,
                port: parseInt(process.env.IMAP_PORT!),
                tls: process.env.IMAP_TLS === 'true',
                auth: {
                    user: process.env.IMAP_USER!,
                    pass: process.env.IMAP_PASSWORD!
                }
            },
            redis_url: process.env.REDIS_URL,
            checkInterval: 60000
        };
        Logger.info('EmailAdapter configuration created');

        Logger.info('Initializing EmailAdapter...');
        const adapter = new EmailAdapter(config);
        Logger.info('EmailAdapter initialized');

        // Handle graceful shutdown
        Logger.info('Setting up shutdown handlers...');
        process.on('SIGTERM', async () => {
            Logger.info('Received SIGTERM signal');
            await adapter.stop();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            Logger.info('Received SIGINT signal');
            await adapter.stop();
            process.exit(0);
        });
        Logger.info('Shutdown handlers set up');

        Logger.info('Starting EmailAdapter...');
        await adapter.start();
        Logger.info('EmailAdapter started successfully');
        
        // Notify parent process that initialization is complete
        Logger.info('Notifying parent process of successful initialization...');
        if (process.send) {
            process.send({ type: 'ready' });
            Logger.info('Parent process notified');
        }
        
        Logger.info('=== Email Process Initialization Complete ===');
    } catch (error) {
        Logger.error('Failed to start Email process:', error);
        process.exit(1);
    }
}

startEmail().catch(error => {
    Logger.error('Unhandled error in Email process:', error);
    process.exit(1);
});