import { EventEmitter } from 'events';
import { Logger, RedisClient, RedisMessage, REDIS_CHANNELS } from '@hiveai/utils';
import Imap from 'node-imap';
import { simpleParser } from 'mailparser';
import { v4 as uuid } from 'uuid';
import sgMail from '@sendgrid/mail';
import { WebhookServer } from './webhookServer';

export interface EmailConfig {
    SENDGRID_API_KEY: string;
    SENDGRID_SIGNING_SECRET: string;
    WEBHOOK_PORT: number;
    imap: {
        host: string;
        port: number;
        tls: boolean;
        auth: {
            user: string;
            pass: string;
        }
    };
    redis_url: string;
    checkInterval?: number; // milliseconds, default 60000 (1 minute)
}

export class EmailAdapter extends EventEmitter {
    // private transporter: nodemailer.Transporter;
    private imap: Imap;
    private redisClient: RedisClient;
    private readonly config: EmailConfig;
    private checkInterval: NodeJS.Timeout | null = null;
    private webhookServer: WebhookServer;
    private isImapReady: boolean = false;

    constructor(config: EmailConfig) {
        super();
        Logger.info('=== Initializing EmailAdapter Components ===');
        
        this.config = config;
        Logger.info('Config loaded');
        Logger.info(this.config);

        Logger.info('Setting up SendGrid...');
        sgMail.setApiKey(config.SENDGRID_API_KEY);
        Logger.info('SendGrid configured');
        
        Logger.info('Setting up IMAP client...');
        this.imap = new Imap({
            user: config.imap.auth.user,
            password: config.imap.auth.pass,
            host: config.imap.host,
            port: config.imap.port,
            tls: config.imap.tls,
            tlsOptions: { rejectUnauthorized: false }
        });
        Logger.info('IMAP client created');

        Logger.info('Setting up Redis client...');
        this.redisClient = new RedisClient({ url: config.redis_url });
        Logger.info('Redis client created');

        Logger.info('Setting up webhook server...');
        this.webhookServer = new WebhookServer({
            port: config.WEBHOOK_PORT,
            sendgridSigningSecret: config.SENDGRID_SIGNING_SECRET,
            redisClient: this.redisClient
        });
        Logger.info('Webhook server created');

        Logger.info('Setting up IMAP error handlers...');
        this.imap.on('error', (err: any) => {
            Logger.error('IMAP error:', err);
        });
        Logger.info('IMAP error handlers set up');
        
        Logger.info('=== EmailAdapter Components Initialized ===');
    }

    async start(): Promise<void> {
        try {
            Logger.info('=== Starting EmailAdapter Services ===');

            Logger.info('Setting up Redis subscription...');
            await this.redisClient.subscribe(REDIS_CHANNELS.EMAIL, 
                async (message: RedisMessage) => {
                    if (message.destination === REDIS_CHANNELS.EMAIL) {
                        await this.handleIncomingRedisMessage(message);
                    }
            });
            Logger.info('Redis subscription established');

            Logger.info('Starting IMAP connection...');
            await this.connectImap();
            Logger.info('IMAP connection established');

            Logger.info('Starting webhook server...');
            await this.webhookServer.start();
            Logger.info('Webhook server started');

            Logger.info('Setting up email checking interval...');
            const interval = this.config.checkInterval || 60000;
            this.checkInterval = setInterval(() => {
                this.checkEmails().catch(err => {
                    Logger.error('Error checking emails:', err);
                });
            }, interval);
            Logger.info('Email checking interval set up');

            Logger.info('=== EmailAdapter Services Started Successfully ===');
        } catch (error) {
            Logger.error('Failed to start email adapter:', error);
            throw error;
        }
    }

    private connectImap(): Promise<void> {
        return new Promise((resolve, reject) => {
            let isResolved = false;

            const handleError = (err: any) => {
                if (!isResolved) {
                    Logger.error('IMAP connection error:', err);
                    isResolved = true;
                    reject(err);
                }
            };

            this.imap.once('ready', () => {
                Logger.info('IMAP connection ready');
                isResolved = true;
                resolve();
            });

            this.imap.once('error', handleError);
            this.imap.once('end', () => {
                if (!isResolved) {
                    handleError(new Error('IMAP connection ended unexpectedly'));
                }
            });

            try {
                Logger.info('Attempting IMAP connection...');
                this.imap.connect();
            } catch (err) {
                handleError(err);
            }
        });
    }

    private async handleIncomingRedisMessage(message: RedisMessage): Promise<void> {
        try {
            Logger.info("Email Adapter :: handleIncomingRedisMessage");
 

            // Handle different types of email messages
            switch (message.payload.type) {
                case 'email':
                    await this.sendEmail(
                        message.payload.to,
                        message.payload.subject || 'No Subject',
                        message.payload.content,
                        message.payload.options
                    );
                    break;
                default:
                    Logger.warn('Unknown message type:', message.payload.type);
            }
        } catch (error) {
            Logger.error('Error handling Redis message:', error);
        }
    }

    private async checkEmails(): Promise<void> {
        try {
            // Check if IMAP is ready
            if (!this.imap.state || this.imap.state === 'disconnected') {
                Logger.warn('IMAP not connected, attempting reconnection...');
                await this.connectImap();
            }

            return new Promise((resolve, reject) => {
                this.imap.openBox('INBOX', false, (err: any, box: any) => {
                    if (err) {
                        Logger.error('Error opening INBOX:', err);
                        return reject(err);
                    }

                    Logger.info('Successfully opened INBOX');

                    // Search for unread emails
                    this.imap.search(['UNSEEN'], (err: any, results: any) => {
                        if (err) {
                            Logger.error('Error searching for unread emails:', err);
                            return reject(err);
                        }

                        if (!results.length) {
                            Logger.info('No unread emails found');
                            return resolve();
                        }

                        Logger.info(`Found ${results.length} unread email(s)`);

                        const fetch = this.imap.fetch(results, {
                            bodies: '',
                            markSeen: true
                        });

                        fetch.on('message', (msg: any) => {
                            msg.on('body', (stream: any) => {
                                simpleParser(stream, async (err: any, parsed: any) => {
                                    if (err) {
                                        Logger.error('Error parsing email:', err);
                                        return;
                                    }

                                    // Publish email to Redis
                                    await this.redisClient.publish(REDIS_CHANNELS.INTERNAL, {
                                        id: uuid(),
                                        timestamp: Date.now(),
                                        type: 'INTERNAL',
                                        source: 'email',
                                        destination: 'hivemind/ceo',
                                        payload: {
                                            type: 'email',
                                            from: parsed.from?.text,
                                            subject: parsed.subject,
                                            content: parsed.text,
                                            html: parsed.html,
                                            attachments: parsed.attachments,
                                            messageId: parsed.messageId
                                        }
                                    });
                                    Logger.info('Published email to Redis:', parsed.messageId);
                                });
                            });
                        });

                        fetch.once('error', (err: any) => {
                            Logger.error('Fetch error:', err);
                            reject(err);
                        });

                        fetch.once('end', () => {
                            Logger.info('Finished fetching all messages');
                            resolve();
                        });
                    });
                });
            });
        } catch (error) {
            Logger.error('Error in checkEmails:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        await this.webhookServer.stop();
        await this.redisClient.disconnect();
        this.imap.end();
        // this.transporter.close();
        Logger.info('Email adapter stopped');
    }

    private async ensureImapConnection(): Promise<void> {
        if (!this.imap.state || this.imap.state === 'disconnected') {
            Logger.warn('IMAP not connected, attempting reconnection...');
            await this.connectImap();
        }
    }

    private createEmailContent(msg: any): Buffer {
            // Create a plain text version by stripping HTML
            const plainText = msg.text.replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();

        // Generate a unique boundary
        const boundary = `----=_Part_${Math.random().toString(36).substr(2)}`;

        // Create email content with proper CRLF line endings
        const emailContent = [
            `From: ${msg.from.name} <${msg.from.email}>`,
            `To: ${msg.to.join(', ')}`,
            msg.cc ? `Cc: ${msg.cc.join(', ')}` : '',
            `Subject: ${msg.subject}`,
            `Date: ${new Date().toUTCString()}`,
            `Message-ID: <${uuid()}@degenhive.ai>`,
            'MIME-Version: 1.0',
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            '',
            'This is a multi-part message in MIME format.',
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(plainText).toString('base64'),
            '',
            `--${boundary}`,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(msg.html).toString('base64'),
            '',
            `--${boundary}--`,
            '' // Final newline
        ].filter(Boolean).join('\r\n');

        // Convert to Buffer with proper line endings
        return Buffer.from(emailContent, 'utf-8');
    }

    private appendToSentMail(emailContent: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            // First, open the Sent Mail box
            this.imap.openBox('[Gmail]/Sent Mail', false, (boxErr: any) => {
                if (boxErr) {
                    Logger.error('Error opening Sent Mail box:', boxErr);
                    return reject(boxErr);
                }
    
                // Then append the email with properly formatted options
                const options = {
                    mailbox: '[Gmail]/Sent Mail',
                    flags: ['\\Seen']
                    // Removed the date option as it's causing issues
                };
    
                this.imap.append(emailContent, options, (appendErr: any) => {
                    if (appendErr) {
                        Logger.error('Error appending to Sent Mail:', appendErr);
                        reject(appendErr);
                    } else {
                        Logger.info('Email saved to Sent Mail folder');
                        resolve();
                    }
                });
            });
        });
    }

    async sendEmail(
        to: string[], 
        subject: string, 
        content: string, 
        options?: {
            cc?: string[];
            bcc?: string[];
            htmlContent?: string;
            template_id?: string;
            attachments?: any[];
        }
    ): Promise<void> {
        try {
            const msg = {
                to: ["rahul@degenhive.ai"],
                from: {
                    email: 'capitaldesk@degenhive.ai',
                    name: 'Rahul, Founder @DegenHive'  
                },
                subject,
                text: content,
                html: options?.htmlContent || content,
                cc: options?.cc,
                bcc: ["rahulmittal4233@gmail.com"],
                template_id: options?.template_id,
                attachments: options?.attachments,
            };

            // First, try to send via SendGrid with retries
            let retries = 3;
            let sendgridResponse;
            
            while (retries > 0) {
                try {
                    sendgridResponse = await sgMail.send(msg);
                    Logger.info(`Email sent successfully to ${to.join(', ')}. Status: ${sendgridResponse[0].statusCode}`);
                    break; // Exit loop if successful
                } catch (error: any) {
                    retries--;
                    if (retries === 0) throw error;
                    await new Promise(resolve => setTimeout(resolve, (3 - retries) * 1000));
                    Logger.warn(`Retrying SendGrid send. Attempts remaining: ${retries}`);
                }
            }

            // Only try to save to Sent folder if SendGrid was successful
            if (sendgridResponse) {
                try {
                    await this.ensureImapConnection();
                    
                    // Use the new createEmailContent method
                    const emailContent = this.createEmailContent(msg);
                    
                    await this.appendToSentMail(emailContent);
                    Logger.info(`Email saved to Sent Mail folder for ${msg.to.join(', ')}`);
                } catch (error: any) {
                    Logger.error('Failed to save email to Sent folder:', error);
                }
            }
        } catch (error: any) {
            Logger.error('Error sending email:', {
                error: error.message,
                recipients: to,
                subject
            });
            throw error;
        }
    }
}
