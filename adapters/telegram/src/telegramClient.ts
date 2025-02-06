/**
 * TelegramClient: A production-grade Telegram bot client
 * that initializes the Telegraf bot, registers message handlers,
 * and handles graceful shutdown.
 */
import { Telegraf, Context } from "telegraf";
import { MessageManager } from "./messageManager";
import { Logger } from "../../utils/logger";
import { IUserManager } from "./userManager";
import { ITradeManager } from "./tradeManager";
import { IRLManager } from "./rlManager";
import { IMemoryManager } from "./memoryManager";

interface TelegramClientOptions {
  botToken: string;
  userManager: IUserManager;
  tradeManager: ITradeManager;
  rlManager: IRLManager;
  memoryManager: IMemoryManager;
}

export class TelegramClient {
  private bot: Telegraf<Context>;
  private messageManager: MessageManager;

  constructor(private options: TelegramClientOptions) {
    Logger.info("Constructing Hive Swarm TelegramClient...");
    this.bot = new Telegraf(options.botToken);
    // Instantiate MessageManager and inject dependencies from options
    this.messageManager = new MessageManager({
      bot: this.bot,
      userManager: options.userManager,
      tradeManager: options.tradeManager,
      rlManager: options.rlManager,
      memoryManager: options.memoryManager,
    });
  }

  public async start(): Promise<void> {
    Logger.info("Starting Telegram bot...");
    try {
      // Set up basic message handlers
      this.setupHandlers();
      // Launch the bot (drop pending updates in production)
      await this.bot.launch({ dropPendingUpdates: true });
      Logger.success("Telegram bot successfully launched!");
      this.setupShutdownHandlers();
    } catch (error) {
      Logger.error("Error starting Telegram bot:", error);
      throw error;
    }
  }

  private setupHandlers(): void {
    // Delegate message handling to the MessageManager
    this.bot.on("message", async (ctx) => {
      try {
        await this.messageManager.handleMessage(ctx);
      } catch (error) {
        Logger.error("Error in message handler:", error);
      }
    });
  }

  private setupShutdownHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      Logger.info(`Received ${signal}. Shutting down Telegram bot gracefully...`);
      try {
        await this.bot.stop();
        Logger.info("Telegram bot stopped.");
      } catch (error) {
        Logger.error("Error during shutdown:", error);
      }
      process.exit(0);
    };

    process.once("SIGINT", () => shutdownHandler("SIGINT"));
    process.once("SIGTERM", () => shutdownHandler("SIGTERM"));
  }
}