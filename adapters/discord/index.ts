import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { EventEmitter } from "events";
import { Logger } from "../../utils/logger";
import { MessageHandler } from "./handlers/messageHandler";
import { AnnouncementHandler } from "./handlers/announcementHandler";
import { CommunityHandler } from "./handlers/communityHandler";
import { DiscordConfig } from "./types";
import { MessageBroker, CrossClientMessage } from '@hiveai/messaging';
import { DragonbeeInteractionManager } from './handlers/dragonbeeInteractionManager';

export class DiscordAdapter extends EventEmitter {
    private client: Client;
    private messageHandler: MessageHandler;
    private announcementHandler: AnnouncementHandler;
    private communityHandler: CommunityHandler;
    private config: DiscordConfig;
    private messageBroker?: MessageBroker;
    private dragonbeeManager: DragonbeeInteractionManager;

    constructor(config: DiscordConfig) {
        super();
        this.config = config;
        
        // Initialize Discord client with required intents
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildMessageReactions
            ],
            partials: [
                Partials.Channel,
                Partials.Message,
                Partials.Reaction
            ]
        });

        // Initialize handlers
        this.messageHandler = new MessageHandler(this.client);
        this.announcementHandler = new AnnouncementHandler(this.client, config);
        this.communityHandler = new CommunityHandler(this.client);
        this.dragonbeeManager = new DragonbeeInteractionManager(this.client);

        // Initialize RabbitMQ if config provided
        if (config.messageBroker) {
            this.messageBroker = new MessageBroker({
                url: config.messageBroker.url,
                exchange: config.messageBroker.exchange,
                clientId: 'discord'
            });
            this.setupMessageBroker();
        }

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Client ready event
        this.client.once(Events.ClientReady, () => {
            Logger.info(`Discord bot logged in as ${this.client.user?.tag}`);
        });

        // Handle incoming messages
        this.client.on(Events.MessageCreate, async (message) => {
            if (message.author.bot) return;
            
            try {
                // Emit message event for external handlers
                this.emit("message", {
                    id: message.id,
                    content: message.content,
                    author: message.author.id,
                    channelId: message.channelId,
                    guildId: message.guildId,
                    timestamp: message.createdTimestamp
                });

                // Handle message based on context
                if (message.channelId === this.config.announcementChannelId) {
                    await this.announcementHandler.handleMessage(message);
                } else {
                    await this.messageHandler.handleMessage(message);
                }
            } catch (error) {
                Logger.error("Error handling Discord message:", error);
            }
        });

        // Handle reactions (for engagement tracking)
        this.client.on(Events.MessageReactionAdd, async (partialReaction, partialUser) => {
            if (partialUser.bot) return;
            const reaction = partialReaction.partial ? await partialReaction.fetch() : partialReaction;
            const user = partialUser.partial ? await partialUser.fetch() : partialUser;
            await this.communityHandler.handleReaction(reaction, user);
        });
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
        // Implement cross-client message handling
        // This could forward messages to appropriate Discord channels
    }

    private async handleAlert(message: CrossClientMessage): Promise<void> {
        // Handle alerts, possibly sending them to a designated alerts channel
    }

    private async handleNotification(message: CrossClientMessage): Promise<void> {
        // Handle notifications from other clients
    }

    private async handleCommand(message: CrossClientMessage): Promise<void> {
        // Handle cross-client commands
    }

    async start(): Promise<void> {
        try {
            // Connect to RabbitMQ if configured
            if (this.messageBroker) {
                await this.messageBroker.connect();
            }

            await this.client.login(this.config.token);
            Logger.info("Discord adapter started successfully");
        } catch (error) {
            Logger.error("Failed to start Discord adapter:", error);
            throw error;
        }
    }

    async makeAnnouncement(content: string, options?: { pingRole?: string }): Promise<void> {
        await this.announcementHandler.makeAnnouncement(content, options);
    }

    async sendMessage(channelId: string, content: string): Promise<void> {
        const channel = await this.client.channels.fetch(channelId);
        if (channel?.isTextBased()) {
            await channel.send(content);
        }
    }

    async stop(): Promise<void> {
        // Disconnect RabbitMQ if connected
        if (this.messageBroker) {
            await this.messageBroker.disconnect();
        }

        this.client.destroy();
        Logger.info("Discord adapter stopped");
    }

    async handleAnnouncementResponse(
        action: 'approve' | 'reject' | 'edit',
        announcementId: string,
        editedContent?: string
    ): Promise<void> {
        await this.announcementHandler.handleFounderResponse(
            action,
            announcementId,
            editedContent
        );
    }

    private async handleMessage(message: any): Promise<void> {
        // Existing message handling logic...
        
        // Optionally broadcast certain messages to other clients
        if (this.shouldBroadcastMessage(message)) {
            await this.broadcastMessage(message.content);
        }
    }

    private shouldBroadcastMessage(message: any): boolean {
        // Implement logic to determine if a message should be broadcast
        return false; // Default to false, implement your conditions
    }

    async broadcastMessage(content: string): Promise<void> {
        if (!this.messageBroker) return;

        await this.messageBroker.publish({
            source: 'discord',
            type: 'MESSAGE',
            payload: {
                content,
                timestamp: Date.now()
            }
        });
    }
} 