import { EventEmitter } from 'events';
import { Logger } from '@hiveai/utils';
import { MessageBroker, CrossClientMessage } from '@hiveai/messaging';
import nodemailer from 'nodemailer';
import Imap from 'node-imap';
import { simpleParser } from 'mailparser';

export interface EmailConfig {
    smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
            user: string;
            pass: string;
        }
    };
    imap: {
        host: string;
        port: number;
        tls: boolean;
        auth: {
            user: string;
            pass: string;
        }
    };
    messageBroker?: {
        url: string;
        exchange: string;
    };
    checkInterval?: number; // milliseconds, default 60000 (1 minute)
}

export class EmailAdapter extends EventEmitter {
    private transporter: nodemailer.Transporter;
    private imap: Imap;
    private messageBroker?: MessageBroker;
    private readonly config: EmailConfig;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(config: EmailConfig) {
        super();
        this.config = config;
        
        // Setup SMTP for sending
        this.transporter = nodemailer.createTransport(config.smtp);

        // Setup IMAP for receiving
        this.imap = new Imap({
            user: config.imap.auth.user,
            password: config.imap.auth.pass,
            host: config.imap.host,
            port: config.imap.port,
            tls: config.imap.tls,
            tlsOptions: { rejectUnauthorized: false }
        });

        // Setup message broker for Telegram notifications
        if (config.messageBroker) {
            this.messageBroker = new MessageBroker({
                url: config.messageBroker.url,
                exchange: config.messageBroker.exchange,
                clientId: 'email'
            });
        }

        // Setup IMAP error handling
        this.imap.on('error', (err: any) => {
            Logger.error('IMAP error:', err);
        });
    }

    async start(): Promise<void> {
        try {
            // Connect message broker if configured
            if (this.messageBroker) {
                await this.messageBroker.connect();
            }

            // Start IMAP connection
            await this.connectImap();

            // Start periodic email checking
            const interval = this.config.checkInterval || 60000; // default 1 minute
            this.checkInterval = setInterval(() => {
                this.checkEmails().catch(err => {
                    Logger.error('Error checking emails:', err);
                });
            }, interval);

            Logger.info('Email adapter started successfully');
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

                                // Notify via Telegram
                                if (this.messageBroker) {
                                    await this.messageBroker.publish({
                                        type: 'NOTIFICATION',
                                        payload: {
                                            content: `�� New Email\n\nFrom: ${parsed.from?.text}\nSubject: ${parsed.subject}${parsed.text ? '\nPreview:\n' + parsed.text.substring(0, 200) + '...' : ''}`.trim(),
                                            timestamp: Date.now()
                                        }
                                    });
                                }
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
        
        if (this.messageBroker) {
            await this.messageBroker.disconnect();
        }
        
        this.imap.end();
        this.transporter.close();
        Logger.info('Email adapter stopped');
    }

    async sendEmail(to: string, subject: string, content: string): Promise<void> {
        try {
            await this.transporter.sendMail({
                from: this.config.smtp.auth.user,
                to,
                subject,
                text: content
            });
            Logger.info(`Email sent to ${to}`);
        } catch (error) {
            Logger.error('Error sending email:', error);
            throw error;
        }
    }
}
