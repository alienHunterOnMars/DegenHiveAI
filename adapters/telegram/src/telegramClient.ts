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
    private userManager: UserManager;
    private tradeManager: TradeManager;
    private rlManager: RLManager;
    private memoryManager: MemoryManager;

    constructor(config: TelegramClientOptions) {
        this.bot = new Telegraf(config.token);
        this.redisClient = new RedisClient({ url: config.redis_url });
        
        // Initialize managers
        this.userManager = new UserManager();
        this.tradeManager = new TradeManager();
        this.rlManager = new RLManager();
        this.memoryManager = new MemoryManager();
        
        this.messageManager = new MessageManager({
            bot: this.bot,
            userManager: this.userManager,
            tradeManager: this.tradeManager,
            rlManager: this.rlManager,
            memoryManager: this.memoryManager,
            founderChatId: config.founderChatId,
            communityChatId: config.communityChatId
        });

        this.setupHandlers();
    }

    private setupHandlers() {
        this.bot.on('message', (ctx) => this.messageManager.handleMessage(ctx, this.redisClient));
    }

    async start(): Promise<void> {
        try {
            // Start the bot
            await this.bot.launch();
            Logger.info('Telegram bot launched successfully');

            // Initialize Redis connection
            await this.redisClient.connect();
            Logger.info('Redis client connected successfully');

            // Subscribe to the TELEGRAM channel
            await this.redisClient.subscribe(REDIS_CHANNELS.TELEGRAM, async (message: string) => {
                try {
                    // Parse the message
                    const parsedMessage = JSON.parse(message) as RedisMessage;
                    Logger.info(`Received message on TELEGRAM channel:`, parsedMessage);

                    if (parsedMessage.destination === 'TELEGRAM' && parsedMessage.payload) {
                        const { chatId, text, options } = parsedMessage.payload;
                        
                        if (chatId && text) {
                            await this.sendMessage(chatId, text, options);
                            Logger.info(`Sent message to Telegram chat ${chatId}`);
                        } else {
                            Logger.error('Invalid message payload:', parsedMessage.payload);
                        }
                    }
                } catch (error) {
                    Logger.error('Error processing Redis message:', error);
                }
            });

            Logger.info('Telegram client started and subscribed to Redis channel');
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