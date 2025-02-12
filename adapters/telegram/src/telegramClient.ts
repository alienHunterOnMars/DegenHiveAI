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
    groupChatId: string;
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
            memoryManager: this.memoryManager
        });

        this.setupHandlers();
    }

    private setupHandlers() {
        this.bot.on('message', (ctx) => this.messageManager.handleMessage(ctx, this.redisClient));
    }

    async start(): Promise<void> {
        await this.bot.launch();

        // Subscribe to outbound messages from other processes
        await this.redisClient.subscribe( REDIS_CHANNELS.SOCIAL_OUTBOUND, 
              async (message: RedisMessage) => {
                if (message.source === 'telegram') {
                  await this.sendMessage(
                    message.payload.chatId,
                    message.payload.text,
                    message.payload.options
                  );
                }
        });        

        Logger.info('Telegram client started');
    }

    async stop(): Promise<void> {
        await this.bot.stop();
        await this.redisClient.disconnect();
        Logger.info('Telegram client stopped');
    }

    async sendMessage(chatId: string, text: string, options?: any): Promise<any> {
        return this.bot.telegram.sendMessage(chatId, text, options);
    }
}