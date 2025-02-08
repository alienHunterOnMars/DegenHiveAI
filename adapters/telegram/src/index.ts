/**
 * Entry point for the DegenHive AI Hive Swarm Telegram Client.
 * 
 * This file initializes:
 * - UserManager, TradeManager, RLManager, MemoryManager.
 * - The TelegramClient (with its embedded MessageManager).
 * - Global periodic synchronization between global and local RL models.
 */
import { EventEmitter } from 'events';
import { Logger } from '@hiveai/utils';
import { MessageBroker, CrossClientMessage } from '@hiveai/messaging';
import { TelegramClient, TelegramClientOptions } from './telegramClient';
import { UserManager } from "./userManager";
import { TradeManager } from "./tradeManager";
import { RLManager } from "./rlManager";
import { MemoryManager } from "./memoryManager";

export interface TelegramConfig extends TelegramClientOptions {
    messageBroker?: {
        url: string;
        exchange: string;
    };
}

export class TelegramAdapter extends EventEmitter {
    private client: TelegramClient;
    private messageBroker?: MessageBroker;
    private readonly config: TelegramConfig;

    constructor(config: TelegramConfig) {
        super();

        this.config = config;
        this.client = new TelegramClient(config);

        if (config.messageBroker) {
            this.messageBroker = new MessageBroker({
                url: config.messageBroker.url,
                exchange: config.messageBroker.exchange,
                clientId: 'telegram'
            });
            this.setupMessageBroker();
        }
    }

    private setupMessageBroker(): void {
        if (!this.messageBroker) return;
        this.messageBroker.on('message', this.handleCrossClientMessage.bind(this));
    }

    private async handleCrossClientMessage(message: CrossClientMessage): Promise<void> {
        if (!this.messageBroker) return;

        try {
            switch (message.type) {
                case 'MESSAGE':
                    await this.handleIncomingMessage(message);
                    break;
                case 'ALERT':
                    await this.handleAlert(message);
                    break;
                case 'NOTIFICATION':
                    await this.handleNotification(message);
                    break;
                case 'COMMAND':
                    await this.handleCommand(message);
                    break;
            }
        } catch (error) {
            Logger.error('Error handling cross-client message:', error);
        }
    }

    private async handleIncomingMessage(message: CrossClientMessage): Promise<void> {
        if (message.payload.content) {
            await this.client.sendMessage(this.config.groupChatId, message.payload.content);
        }
    }

    private async handleAlert(message: CrossClientMessage): Promise<void> {
        if (message.payload.content) {
            await this.client.sendMessage(this.config.founderChatId, `🚨 ${message.payload.content}`);
        }
    }

    private async handleNotification(message: CrossClientMessage): Promise<void> {
        if (message.payload.content) {
            await this.client.sendMessage(this.config.groupChatId, `📢 ${message.payload.content}`);
        }
    }

    private async handleCommand(message: CrossClientMessage): Promise<void> {
        // Handle cross-platform commands
    }

    async start(): Promise<void> {
        try {
            if (this.messageBroker) {
                await this.messageBroker.connect();
            }
            await this.client.start();
            Logger.info('Telegram adapter started successfully');
        } catch (error) {
            Logger.error('Failed to start Telegram adapter:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.messageBroker) {
            await this.messageBroker.disconnect();
        }
        await this.client.stop();
        Logger.info('Telegram adapter stopped');
    }

    async sendFounderMessage(message: string, options?: any): Promise<any> {
        if (this.messageBroker && options?.broadcast) {
            await this.broadcastMessage(message);
        }
        return this.client.sendMessage(this.config.founderChatId, message, options);
    }

    async broadcastMessage(content: string): Promise<void> {
        if (!this.messageBroker) return;

        await this.messageBroker.publish({
            type: 'MESSAGE',
            payload: {
                content,
                timestamp: Date.now()
            }
        });
    }
}

 