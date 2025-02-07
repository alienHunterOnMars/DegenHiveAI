/**
 * Entry point for the DegenHive AI Hive Swarm Telegram Client.
 * 
 * This file initializes:
 * - UserManager, TradeManager, RLManager, MemoryManager.
 * - The TelegramClient (with its embedded MessageManager).
 * - Global periodic synchronization between global and local RL models.
 */
import { TelegramClient } from "./telegramClient";
import { UserManager } from "./userManager";
import { TradeManager } from "./tradeManager";
import { RLManager } from "./rlManager";
import { MemoryManager } from "./memoryManager";
import { Logger } from "@hiveai/utils";
import { EventEmitter } from 'events';
import { MessageBroker, CrossClientMessage } from '@hiveai/messaging';

export interface TelegramConfig {
    token: string;
    founderChatId: string;
    groupChatId: string;
    messageBroker?: {
        url: string;
        exchange: string;
    };
}

export class TelegramAdapter extends EventEmitter {
    private messageBroker?: MessageBroker;
    private client: TelegramClient;
    private readonly config: TelegramConfig;

    constructor(config: TelegramConfig) {
        super();
        this.config = config;
        this.client = new TelegramClient(config);

        // Initialize RabbitMQ if config provided
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
        // Forward messages to appropriate Telegram channels/chats
        if (message.payload.content) {
            await this.client.sendMessage(this.config.groupChatId, message.payload.content);
        }
    }

    private async handleAlert(message: CrossClientMessage): Promise<void> {
        // Send alerts to founder or designated alert channel
        if (message.payload.content) {
            await this.client.sendMessage(this.config.founderChatId, `🚨 ${message.payload.content}`);
        }
    }

    private async handleNotification(message: CrossClientMessage): Promise<void> {
        // Handle notifications appropriately
        if (message.payload.content) {
            await this.client.sendMessage(this.config.groupChatId, `📢 ${message.payload.content}`);
        }
    }

    private async handleCommand(message: CrossClientMessage): Promise<void> {
        // Process cross-platform commands
    }

    async start(): Promise<void> {
        try {
            // Connect to RabbitMQ if configured
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
        // Broadcast important messages to other platforms
        if (this.messageBroker && options?.broadcast) {
            await this.broadcastMessage(message);
        }
        return this.client.sendMessage(this.config.founderChatId, message, options);
    }

    async broadcastMessage(content: string): Promise<void> {
        if (!this.messageBroker) return;

        await this.messageBroker.publish({
            source: 'telegram',
            type: 'MESSAGE',
            payload: {
                content,
                timestamp: Date.now()
            }
        });
    }
}

async function boot() {
  try {
    Logger.info("Bootstrapping DegenHive AI Hive Swarm Telegram Client...");

    // Initialize managers
    const userManager = new UserManager();
    const tradeManager = new TradeManager();
    const rlManager = new RLManager();
    const memoryManager = new MemoryManager();

    // Initialize and start Telegram client (injecting dependencies into its MessageManager)
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
    if (!telegramBotToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is missing");
    }

    const telegramClient = new TelegramClient({
      botToken: telegramBotToken,
      userManager,
      tradeManager,
      rlManager,
      memoryManager,
    });

    // Start the Telegram client
    await telegramClient.start();
    
    // Optionally, start a periodic sync from global RL to all local models
    setInterval(() => {
      rlManager.syncLocalModels();
    }, 60 * 60 * 1000); // e.g., every hour

    Logger.success("DegenHive AI Hive Swarm Telegram Client started successfully!");
  } catch (error) {
    Logger.error("Boot error:", error);
    process.exit(1);
  }
}

boot();
