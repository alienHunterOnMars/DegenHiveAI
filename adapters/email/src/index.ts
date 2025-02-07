import { EventEmitter } from 'events';
import { Logger } from '@hiveai/utils';
import { MessageBroker, CrossClientMessage } from '@hiveai/messaging';
import nodemailer from 'nodemailer';

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
    messageBroker?: {
        url: string;
        exchange: string;
    };
}

export class EmailAdapter extends EventEmitter {
    private transporter: nodemailer.Transporter;
    private messageBroker?: MessageBroker;
    private readonly config: EmailConfig;

    constructor(config: EmailConfig) {
        super();
        this.config = config;
        this.transporter = nodemailer.createTransport(config.smtp);

        if (config.messageBroker) {
            this.messageBroker = new MessageBroker({
                url: config.messageBroker.url,
                exchange: config.messageBroker.exchange,
                clientId: 'email'
            });
        }
    }

    async start(): Promise<void> {
        try {
            if (this.messageBroker) {
                await this.messageBroker.connect();
            }
            Logger.info('Email adapter started successfully');
        } catch (error) {
            Logger.error('Failed to start email adapter:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.messageBroker) {
            await this.messageBroker.disconnect();
        }
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
