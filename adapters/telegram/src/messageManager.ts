/**
 * MessageManager: Processes incoming Telegram messages.
 *
 * Handles:
 * - Sending welcome messages and connection steps.
 * - Detecting and executing trade commands.
 * - Delegating dragonbee chat or generic interactions to the RL module.
 * - Managing RAG memory updates for user context.
 */
import { Context, Telegraf } from "telegraf";
import { Logger, RedisClient, REDIS_CHANNELS } from "@hiveai/utils";
import { IUserManager } from "./userManager";
import { ITradeManager, TradeOrder } from "./tradeManager";
import { IRLManager } from "./rlManager";
import { IMemoryManager } from "./memoryManager";
import { v4 as uuid } from 'uuid';

interface MessageManagerOptions {
  bot: Telegraf<Context>;
  userManager: IUserManager;
  tradeManager: ITradeManager;
  rlManager: IRLManager;
  memoryManager: IMemoryManager;
}

export class MessageManager {
  constructor(private options: MessageManagerOptions) {}

  // Main entry: process incoming message
  public async handleMessage(ctx: Context, redisClient: RedisClient): Promise<void> {
    try {
      Logger.info("handleMessage");
      Logger.info(ctx);

      const messageText = ctx.message?.text;
      if (!messageText) return; // ignore non-text messages for now

      const telegramUserId = ctx.from?.id.toString();
      if (!telegramUserId) return;

      // Check if this is the user's first interaction
      if (await this.options.userManager.isFirstTime(telegramUserId)) {
        await this.sendWelcomeMessage(ctx);
        // return;
      }

      if (!ctx.chat) return;

      await redisClient.publish(REDIS_CHANNELS.SOCIAL_INBOUND, {
        id: uuid(),
        timestamp: Date.now(),
        type: 'SOCIAL',
        source: 'telegram',
        payload: {
          chatId: ctx.chat.id,
          text: messageText,
          userId: ctx.from?.id,
          messageId: ctx.message?.message_id
        }
      });

      // Update contextual memory (RAG) for the chat
      await this.options.memoryManager.updateMemory(telegramUserId, messageText);

      // Determine if the message is a trade command
      if (this.isTradeCommand(messageText)) {
        const tradeOrder = this.parseTradeOrder(messageText);
        if (tradeOrder) {
          // Determine fee based on connection (0.0% if linked, otherwise 0.1%)
          const feeRate = await this.options.userManager.getFeeRate(telegramUserId);
          tradeOrder.feeRate = feeRate;
          const tradeResult = await this.options.tradeManager.executeTrade(tradeOrder);
          await ctx.reply(`Trade executed: ${tradeResult}`);
          return;
        }
      }

      // Otherwise, process as a dragonbee interaction
      const response = await this.options.rlManager.generateResponse(telegramUserId, messageText);
      await ctx.reply(response);
    } catch (error) {
      Logger.error("Error processing message:", error);
    }
  }

  // Simple check if message indicates a trade
  private isTradeCommand(text: string): boolean {
    const lowerText = text.toLowerCase();
    return lowerText.includes("buy") || lowerText.includes("sell");
  }

  // Parse a trade order from message text
  private parseTradeOrder(text: string): TradeOrder | null {
    // For illustration, very basic parsing:
    // Expected format: "buy 10 sol" or "sell 5 eth"
    const regex = /(buy|sell)\s+([\d\.]+)\s+(\w+)/i;
    const match = text.match(regex);
    if (match) {
      const side = match[1].toLowerCase() as "buy" | "sell";
      const quantity = parseFloat(match[2]);
      const token = match[3].toUpperCase();
      return { side, quantity, token, feeRate: 0 };
    }
    return null;
  }

  // Send welcome and onboarding instructions
  private async sendWelcomeMessage(ctx: Context): Promise<void> {
    const welcomeText = `Welcome to DegenHiveAI!
This bot allows you to trade tokens as well as interact with your dragonbees.
Please connect your Telegram account with your dragonbee-trainer profile.
If you are not connected, trades will incur a 0.1% fee.
To link your profile, reply with /link YOUR_PROFILE_ID`;
    await ctx.reply(welcomeText);
  }
}