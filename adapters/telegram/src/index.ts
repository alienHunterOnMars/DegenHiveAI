/**
 * Entry point for the DegenHive AI Hive Swarm Telegram Client.
 * 
 * This file initializes:
 * - UserManager, TradeManager, RLManager, MemoryManager.
 * - The TelegramClient (with its embedded MessageManager).
 * - Global periodic synchronization between global and local RL models.
 */
import { EventEmitter } from 'events';
import { Logger, RedisClient, RedisMessage, REDIS_CHANNELS } from '@hiveai/utils';
import { TelegramClient, TelegramClientOptions } from './telegramClient';
import { UserManager } from "./userManager";
import { TradeManager } from "./tradeManager";
import { RLManager } from "./rlManager";
import { MemoryManager } from "./memoryManager";
import { v4 as uuid } from 'uuid';
 

export class TelegramAdapter extends EventEmitter {
    private client: TelegramClient;
    private readonly config: TelegramClientOptions;

    constructor(config: TelegramClientOptions) {
        super();

        this.config = config;
        this.client = new TelegramClient(config);
    }

    async start(): Promise<void> {
        try {
            await this.client.start();            
            Logger.info('Telegram adapter started successfully');
        } catch (error) {
            Logger.error('Failed to start Telegram adapter:', error);
            throw error;
        }
    }

 
    async stop(): Promise<void> {
      await this.client.stop();
      Logger.info('Telegram adapter stopped');
    }

    async sendFounderMessage(message: string, options?: any): Promise<any> {
        return this.client.sendMessage(this.config.founderChatId, message, options);
    }
}

 