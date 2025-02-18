/**
 * TelegramClient: A production-grade Telegram bot client
 * that initializes the Telegraf bot, registers message handlers,
 * and handles graceful shutdown.
 */
import { Telegraf, Context } from "telegraf";
import { Logger, RedisClient, RedisMessage, REDIS_CHANNELS } from '@hiveai/utils';
import { UserManager } from "./userManager";
import { TradeManager } from "./tradeManager";
import { RLManager } from "./rlManager";
import { MemoryManager } from "./memoryManager";
import { MessageManager } from "./messageManager";

export interface TelegramClientOptions {
    token: string;
    founderChatId: string;
    communityChatId: string;
    redis_url: string;
}

export class TelegramClient {
    private bot: Telegraf;
    private redisClient: RedisClient;
    private messageManager: MessageManager;

    constructor(config: TelegramClientOptions) {
        this.bot = new Telegraf(config.token);
        this.redisClient = new RedisClient({ url: config.redis_url });
        
        this.messageManager = new MessageManager({
            founderChatId: config.founderChatId,
            communityChatId: config.communityChatId
        });
    }

    async start(): Promise<void> {
        try {
            Logger.info('Starting Telegram client initialization...');
            
            // Start the bot with timeout
            Logger.info('Launching Telegram bot...');
            // const launchTimeout = new Promise((_, reject) => {
            //     setTimeout(() => reject(new Error('Telegram bot launch timed out after 15 seconds')), 15000);
            // });

            this.bot.launch(() => console.log("Bot is starting!"));
            
            // await Promise.race([
            //     this.bot.launch(),
            //     launchTimeout
            // ]);
            Logger.info('Telegram bot launched successfully');

            // Set up message handlers after successful launch
            Logger.info('Setting up message handlers...');
            this.bot.on('message', (ctx) => this.messageManager.handleMessage(ctx, this.redisClient));
            Logger.info('Message handlers set up successfully');

            // Initialize Redis subscription
            Logger.info('Setting up Redis subscription...');
            await this.redisClient.subscribe(REDIS_CHANNELS.TELEGRAM, async (message: RedisMessage) => {
                try {
                    Logger.info(`Received message on TELEGRAM channel:`, message);

                    if (message.destination === REDIS_CHANNELS.TELEGRAM && message.payload) {
                        const { chatId, text, options } = message.payload;
                        
                        if (chatId && text) {
                            await this.sendMessage(chatId, text, options);
                            Logger.info(`Sent message to Telegram chat ${chatId}`);
                        } else {
                            Logger.error('Invalid message payload:', message.payload);
                        }
                    }
                } catch (error) {
                    Logger.error('Error processing Redis message:', error);
                }
            });

            Logger.info('Telegram client initialization completed');
        } catch (error) {
            Logger.error('Error starting Telegram client:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try {
            await this.bot.stop();
            await this.redisClient.disconnect();
            Logger.info('Telegram client stopped');
        } catch (error) {
            Logger.error('Error stopping Telegram client:', error);
            throw error;
        }
    }

    async sendMessage(chatId: string, text: string, options?: any): Promise<any> {
        try {
            return await this.bot.telegram.sendMessage(chatId, text, options);
        } catch (error) {
            Logger.error(`Error sending message to chat ${chatId}:`, error);
            throw error;
        }
    }
}