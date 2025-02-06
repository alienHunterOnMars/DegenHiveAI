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
import { Logger } from "./utils/logger"; // Assume a simple Logger module exists
import { EventEmitter } from 'events';

export interface TelegramConfig {
    token: string;
    founderChatId: string;
    groupChatId: string;
}

export class TelegramAdapter extends EventEmitter {
    constructor(config: TelegramConfig) {
        super();
        Logger.info('Telegram adapter initialized');
    }

    async sendFounderMessage(message: string, options?: any): Promise<any> {
        // Implement later
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
