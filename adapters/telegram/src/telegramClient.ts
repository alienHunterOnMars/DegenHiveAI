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
import { v4 as uuid } from 'uuid';

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
            
            // Handle messages which came as a reply
            this.bot.on('message', async (ctx: any) => {
                if (ctx.message.reply_to_message) {
                    Logger.info('This is a reply to:', {
                        originalMessageId: ctx.message.reply_to_message.message_id,
                        replyText: ctx.message.text
                    });

                    // If this is a reply to our email approval message
                    if (ctx.message.reply_to_message.text?.includes('Email Approval Request')) {
                        let pending_email_id = ctx.message.reply_to_message.text.split('PENDING_EMAIL_ID = {{{')[1].split('}}}')[0];
                        await this.redisClient.publish(REDIS_CHANNELS.INTERNAL, {
                            id: uuid(),
                            type: 'INTERNAL',
                            timestamp: new Date().getTime(),
                            source: 'telegram',
                            destination: 'hivemind/ceo',
                            payload: {
                                type: 'EMAIL_FEEDBACK',
                                approved: false,
                                messageId: ctx.message.reply_to_message.message_id,
                                feedback: ctx.message.text,
                                pending_email_id: pending_email_id
                            }
                        });
                    }
                }
                
                // Continue with normal message handling
                this.messageManager.handleMessage(ctx, this.redisClient);
            });
            
            // Handle callback queries
            this.bot.on('callback_query', async (ctx: any) => {

                const callbackData = ctx.callbackQuery.data;
                Logger.info(`Received callback query: ${callbackData}`);

                // If EMAIL APPROVAL callback, publish to Redis that email was approved
                if (callbackData.startsWith('approve_email_')) {
                    const approval_id = callbackData.replace('approve_email_', '');
                    await this.redisClient.publish(REDIS_CHANNELS.INTERNAL, {
                        id: uuid(),
                        type: 'INTERNAL',
                        timestamp: new Date().getTime(),
                        source: 'telegram',
                        destination: 'hivemind/ceo',
                        payload: {
                            type: 'EMAIL_APPROVED',
                            approval_id: approval_id
                        }
                    });
                }

                // If EMAIL REJECT callback, publish to Redis that email was rejected
                else if (callbackData.startsWith('reject_email_')) {
                    const rejection_id = callbackData.replace('reject_email_', '');
                    await this.redisClient.publish(REDIS_CHANNELS.INTERNAL, {
                        id: uuid(),
                        type: 'INTERNAL',
                        timestamp: new Date().getTime(),
                        source: 'telegram',
                        destination: 'hivemind/ceo',
                        payload: {
                            type: 'EMAIL_REJECTED',
                            rejection_id: rejection_id
                        }
                    });
                }
            });
            Logger.info('Message handlers set up successfully');

            // Initialize Redis subscription
            Logger.info('Setting up Redis subscription...');
            await this.redisClient.subscribe(REDIS_CHANNELS.TELEGRAM, async (message: RedisMessage) => {
                try {
                    console.log(`Received message on TELEGRAM channel:`);
                    console.log(message);
                    console.log("--------------------------------");

                    if (message.destination === REDIS_CHANNELS.TELEGRAM && message.payload) {
                        const { chatId, text, emailApproval, approvalId, options } = message.payload;
                        Logger.info(`Received message on TELEGRAM channel:`, message);
                        console.log(options);
                        console.log("--------------------------------");
                        if (chatId && text && !emailApproval) {
                            await this.sendMessage(chatId, text, options);
                            Logger.info(`Sent message to Telegram chat ${chatId}`);
                        }
                        // We need to request an email approval from the FOUNDER CHAT
                        else if (chatId &&  text && emailApproval) {
                            Logger.info(`Sending email approval for PendingApproval ID: ${approvalId}`);
                            await this.sendEmailApproval(chatId, text, approvalId);
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

    /**
     * Sends an email approval message to the given chat ID.
     * 
     * @param chatId - The ID of the chat to send the message to.
     * @param messageId - The ID of the message to approve.
     * @returns A promise that resolves to the message object.
     */
    async sendEmailApproval(chatId: string, text: string, approvalId: string): Promise<any> {
        text = text + "\n\n PENDING_EMAIL_ID = {{{" + approvalId + "}}}";
        try {
            return await this.bot.telegram.sendMessage(chatId, text, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "APPROVE", callback_data: "approve_email_" + approvalId },
                        { text: "REJECT", callback_data: "reject_email_" + approvalId }
                    ]]
                }
            });
        } catch (error) {
            Logger.error(`Error sending message to chat ${chatId}:`, error);
            throw error;
        }
    }





}