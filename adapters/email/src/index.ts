import { EventEmitter } from 'events';
import { Logger, RedisClient, RedisMessage, REDIS_CHANNELS } from '@hiveai/utils';
import nodemailer from 'nodemailer';
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
            this.imap.once('ready', () => {
                Logger.info('IMAP connection established');
                resolve();
            });

            this.imap.once('error', (err: any) => {
                reject(err);
            });

            this.imap.connect();
        });
    }

    private async handleIncomingRedisMessage(message: RedisMessage): Promise<void> {
        try {
            Logger.info("Email Adapter :: handleIncomingRedisMessage", message);
 

            // Handle different types of email messages
            switch (message.payload.type) {
                case 'email':
                    await this.sendEmail(
                        message.payload.to,
                        message.payload.subject || 'No Subject',
                        message.payload.content
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
        return new Promise((resolve, reject) => {
            this.imap.openBox('INBOX', false, (err: any, box: any) => {
                if (err) return reject(err);

                // Search for unread emails
                this.imap.search(['UNSEEN'], (err: any, results: any) => {
                    if (err) return reject(err);

                    if (!results.length) {
                        return resolve();
                    }

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
                    });

                    fetch.once('end', () => {
                        resolve();
                    });
                });
            });
        });
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
                to,
                from: {
                    email: 'capitaldesk@degenhive.ai',
                    name: 'DegenHive Capital Desk'  
                },
                subject,
                text: content, // Plain text version
                html: options?.htmlContent || content, // HTML version (falls back to plain text if not provided)
                cc: options?.cc,
                bcc: options?.bcc,
                template_id: options?.template_id,
                attachments: options?.attachments,
            };

            // Implement retry logic
            let retries = 3;
            while (retries > 0) {
                try {
                    const response = await sgMail.send(msg);
                    Logger.info(`Email sent successfully to ${to.join(', ')}. Status: ${response[0].statusCode}`);
                    return;
                } catch (error: any) {
                    retries--;
                    if (retries === 0) throw error;
                    
                    // Wait before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, (3 - retries) * 1000));
                    Logger.warn(`Retrying email send. Attempts remaining: ${retries}`);
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
