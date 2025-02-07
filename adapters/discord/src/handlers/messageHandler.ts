import { Client, Message, TextChannel } from "discord.js";
import { Logger } from "@hiveai/utils";
import { DragonbeeInteractionManager } from "./dragonbeeInteractionManager";
// import { MessageTemplates } from "../templates/messageTemplates";
// import { MessageUtils } from "../utils/messageUtils";

export class MessageHandler {
    private client: Client;
    private dragonbeeManager: DragonbeeInteractionManager;
    // private templates: MessageTemplates;
    // private utils: MessageUtils;

    constructor(client: Client) {
        this.client = client;
        this.dragonbeeManager = new DragonbeeInteractionManager(client);
        // this.templates = new MessageTemplates();
        // this.utils = new MessageUtils();
    }

    async handleMessage(message: Message): Promise<void> {
        try {
            // Basic message handling logic
            Logger.info(`Handling message: ${message.content}`);

            // Skip processing if message is from a bot or system
            if (message.author.bot || message.system) return;

            // Check if it's a direct message
            if (message.channel.isDMBased()) {
                await this.handleDirectMessage(message);
                return;
            }

            // Handle channel messages
            await this.handleChannelMessage(message);

        } catch (error) {
            Logger.error("Error in MessageHandler:", error);
            await this.sendErrorResponse(message);
        }
    }

    private async handleDirectMessage(message: Message): Promise<void> {
        try {
            // Check if user has dragonbees and get their details
            const userDragonbees = await this.dragonbeeManager.getUserDragonbees(message.author.id);

            if (!userDragonbees || userDragonbees.length === 0) {
                await this.sendNoDragonbeesMessage(message);
                return;
            }

            // Process message content for commands/intents
            // const intent = await this.utils.detectMessageIntent(message.content);

            // switch (intent.type) {
            //     case "TRADE":
            //         await this.handleTradeCommand(message, intent.data);
            //         break;

            //     case "DRAGONBEE_INTERACTION":
            //         await this.handleDragonbeeInteraction(message, userDragonbees);
            //         break;

            //     case "HELP":
            //         await this.sendHelpMessage(message);
            //         break;

            //     default:
            //         // Default to dragonbee chat interaction
            //         await this.handleDragonbeeInteraction(message, userDragonbees);
            // }

        } catch (error) {
            Logger.error("Error handling direct message:", error);
            await this.sendErrorResponse(message);
        }
    }

    private async handleChannelMessage(message: Message): Promise<void> {
        try {
            // // Check if message mentions the bot
            // const isBotMentioned = message.mentions.users.has(this.client.user.id);

            // // Get channel context
            // const channelContext = await this.utils.getChannelContext(message.channel as TextChannel);

            // if (isBotMentioned) {
            //     await this.handleBotMention(message, channelContext);
            //     return;
            // }

            // // Track message for engagement metrics
            // await this.utils.trackEngagement({
            //     userId: message.author.id,
            //     channelId: message.channelId,
            //     messageType: "CHANNEL",
            //     timestamp: message.createdTimestamp
            // });

            // // Randomly engage in community conversations (configurable probability)
            // if (await this.shouldEngageInConversation(channelContext)) {
            //     await this.generateCommunityResponse(message, channelContext);
            // }

        } catch (error) {
            Logger.error("Error handling channel message:", error);
        }
    }

    private async handleBotMention(message: Message, context: any): Promise<void> {
        try {
            // const response = await this.templates.generateMentionResponse(message.content, context);
            // await message.reply(response);
        } catch (error) {
            Logger.error("Error handling bot mention:", error);
            await this.sendErrorResponse(message);
        }
    }

    private async handleTradeCommand(message: Message, tradeData: any): Promise<void> {
        // Implement trade command processing
        // This should coordinate with the trade execution service
        Logger.info("Processing trade command:", tradeData);
        await message.reply("Trade command processing is not implemented yet.");
    }

    private async handleDragonbeeInteraction(message: Message, dragonbees: any[]): Promise<void> {
        try {
            // const response = await this.dragonbeeManager.processInteraction(
            //     message.content,
            //     dragonbees,
            //     message.author.id
            // );
            // await message.reply(response);
        } catch (error) {
            Logger.error("Error in dragonbee interaction:", error);
            await this.sendErrorResponse(message);
        }
    }

    private async shouldEngageInConversation(context: any): Promise<boolean> {
        // Implement logic to decide if bot should engage
        // Consider factors like:
        // - Time since last bot message
        // - Channel activity level
        // - Conversation topic relevance
        // - Random factor for natural feeling
        return Math.random() < 0.1; // 10% chance for now
    }

    private async generateCommunityResponse(message: Message, context: any): Promise<void> {
        try {
            // const response = await this.templates.generateCommunityResponse(message.content, context);
            // await message.channel.send(response);
        } catch (error) {
            Logger.error("Error generating community response:", error);
        }
    }

    private async sendNoDragonbeesMessage(message: Message): Promise<void> {
        // const response = await this.templates.getNoDragonbeesMessage();
        // await message.reply(response);
    }

    private async sendHelpMessage(message: Message): Promise<void> {
        // const response = await this.templates.getHelpMessage();
        // await message.reply(response);
    }

    private async sendErrorResponse(message: Message): Promise<void> {
        try {
            // const response = await this.templates.getErrorMessage();
            // await message.reply(response);
        } catch (error) {
            Logger.error("Error sending error response:", error);
        }
    }
} 