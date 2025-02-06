import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { EventEmitter } from "events";
import { Logger } from "../../utils/logger";
import { MessageHandler } from "./handlers/messageHandler";
import { AnnouncementHandler } from "./handlers/announcementHandler";
import { CommunityHandler } from "./handlers/communityHandler";
import { DiscordConfig } from "./types";
import { TelegramAdapter } from "../../telegram/telegramAdapter";

export class DiscordAdapter extends EventEmitter {
    private client: Client;
    private messageHandler: MessageHandler;
    private announcementHandler: AnnouncementHandler;
    private communityHandler: CommunityHandler;
    private config: DiscordConfig;
    private telegramAdapter: TelegramAdapter;

    constructor(config: DiscordConfig, telegramAdapter: TelegramAdapter) {
        super();
        this.config = config;
        this.telegramAdapter = telegramAdapter;
        
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
        this.announcementHandler = new AnnouncementHandler(this.client, config, telegramAdapter);
        this.communityHandler = new CommunityHandler(this.client);

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
        this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
            if (user.bot) return;
            await this.communityHandler.handleReaction(reaction, user);
        });
    }

    async start(): Promise<void> {
        try {
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
} 