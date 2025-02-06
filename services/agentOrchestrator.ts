import { Logger } from "../utils/logger";
import type { TelegramAdapter } from "../adapters/telegramAdapter";
import type { DiscordAdapter } from "../adapters/discordAdapter";
import type { TradeExecutionService } from "./tradeExecutionService";
import type { DragonbeeModule } from "../modules/dragonbeeModule";
import { EventBus } from "../infrastructure/eventBus";

export interface AgentOrchestratorOptions {
  eventBus: EventBus;
  tradeService: TradeExecutionService;
  telegramAdapter: TelegramAdapter;
  discordAdapter: DiscordAdapter;
  dragonbeeModule: DragonbeeModule;
}

export class AgentOrchestrator {
  private eventBus: EventBus;
  private tradeService: TradeExecutionService;
  private telegramAdapter: TelegramAdapter;
  private discordAdapter: DiscordAdapter;
  private dragonbeeModule: DragonbeeModule;

  constructor(options: AgentOrchestratorOptions) {
    this.eventBus = options.eventBus;
    this.tradeService = options.tradeService;
    this.telegramAdapter = options.telegramAdapter;
    this.discordAdapter = options.discordAdapter;
    this.dragonbeeModule = options.dragonbeeModule;
  }

  async start(): Promise<void> {
    // Here you could load agent configurations and perform startup tasks.
    Logger.info("AgentOrchestrator starting agents...");
    this.eventBus.emit("startup", { message: "Agent Orchestrator is up" });
  }

  async handleTelegramMessage(msg: any): Promise<void> {
    Logger.info("Handling Telegram message:", msg);
    // Check if the message comes from the founder, group or a direct chat.
    if (msg.chatId === process.env.TELEGRAM_FOUNDER_CHAT_ID) {
      Logger.info("Received founder command on Telegram:", msg);
      this.eventBus.emit("founderCommand", msg);
    } else if (msg.chatId === process.env.TELEGRAM_GROUP_CHAT_ID) {
      Logger.info("Received group message on Telegram:", msg);
      this.eventBus.emit("groupMessage", msg);
    } else {
      // Direct message from user.
      Logger.info("Received direct Telegram message:", msg);
      if (msg.text && msg.text.startsWith("/trade")) {
        // Forward trade command to the trade service.
        await this.tradeService.processTradeCommand(msg);
      } else {
        // Otherwise, process the message through the dragonbee module.
        const response = await this.dragonbeeModule.processInteraction(msg.text);
        this.telegramAdapter.sendMessage(msg.chatId, response);
      }
    }
  }

  async handleDiscordMessage(msg: any): Promise<void> {
    Logger.info("Handling Discord message:", msg);
    // Depending on the channel, process differently.
    if (msg.channelId === process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID) {
      Logger.info("Received announcement message on Discord:", msg);
    } else {
      if (msg.text && msg.text.startsWith("/trade")) {
        await this.tradeService.processTradeCommand(msg);
      } else {
        const response = await this.dragonbeeModule.processInteraction(msg.text);
        this.discordAdapter.sendMessage(msg.channelId, response);
      }
    }
  }
} 