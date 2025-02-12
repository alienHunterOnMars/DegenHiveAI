import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { EventEmitter } from "events";
import { Logger, RedisClient, RedisMessage, REDIS_CHANNELS  } from "@hiveai/utils";
import { AnnouncementHandler } from "./handlers/announcementHandler";
import { CommunityHandler } from "./handlers/communityHandler";
import { DiscordConfig } from "./types";

interface ServerChannelInfo {
    id: string;
    name: string;
    type: string;
    canSendMessages: boolean;
    canReadMessages: boolean;
}

interface ServerInfo {
    id: string;
    name: string;
    memberCount: number;
    ownerId: string;
    channels: ServerChannelInfo[];
    roles: {
        id: string;
        name: string;
        color: string;
        position: number;
    }[];
}

export class DiscordAdapter extends EventEmitter {

    private config: DiscordConfig;
    private client: Client;
    private redisClient: RedisClient;

    private announcementHandler: AnnouncementHandler;
    private communityHandler: CommunityHandler;

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
                GatewayIntentBits.GuildMessageReactions
            ],
            partials: [
                Partials.Channel,
                Partials.Message,
                Partials.Reaction
            ]
        });
        
        // Initialize Redis client
        this.redisClient = new RedisClient({ url: config.redis_url });

        // Initialize handlers
        this.announcementHandler = new AnnouncementHandler(this.client, config);
        this.communityHandler = new CommunityHandler(this.client); 
    }

    private setupEventListeners(): void {
        if ((this.client as any).listenerCount(Events.MessageCreate) > 0) {
            Logger.info("Event listeners already set up, skipping...");
            return;
        }

        // Handle incoming messages with enhanced logging
        this.client.on(Events.MessageCreate, async (message) => {
            Logger.info("=== Discord Message Debug ===");
            Logger.info(`Message received from: ${message.author.tag}`);
            Logger.info(`Content: ${message.content}`);
            Logger.info(`Channel: ${message.channel.id}`);
            Logger.info(`Is bot message: ${message.author.bot}`);
            
            if (message.author.bot) {
                Logger.info("Skipping bot message");
                return;
            }
            
            try {
                // Handle message based on context
                if (message.channelId === this.config.announcementChannelId) {
                    Logger.info("Announcement message - Nothing to do here");
                } else {
                    Logger.info("Processing regular message");
                    await this.communityHandler.handleMessage(message, this.redisClient);
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

        Logger.info("Discord event listeners configured successfully");
    }

 
    async start(): Promise<void> {
        try {
            if (this.client.isReady()) {
                Logger.info("Discord client is already initialized");
                return;
            }

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Discord login timed out after 60 seconds'));
                }, 60000);

                this.client.once(Events.ClientReady, () => {
                    clearTimeout(timeout);
                    Logger.info(`Discord client ready - Logged in as ${this.client.user?.tag}`);
                    resolve();
                });

                this.client.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(new Error(`Discord connection error: ${error.message}`));
                });

                Logger.info("Attempting to log in to Discord...");
                this.client.login(this.config.token).catch((error) => {
                    clearTimeout(timeout);
                    reject(new Error(`Discord login failed: ${error.message}`));
                });
            });

            this.setupEventListeners();

            Logger.info("Discord adapter initialization complete");

        } catch (error) {
            Logger.error("Failed to initialize Discord client:", error);
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
        await this.redisClient.disconnect();
        Logger.info("Discord adapter stopped");
    }

 
 
    async getServers(): Promise<ServerInfo[]> {
        try {
            // Check if client is ready instead of just checking user
            if (!this.client.isReady()) {
                await new Promise<void>((resolve) => {
                    this.client.once(Events.ClientReady, () => resolve());
                });
            }

            const servers: ServerInfo[] = [];

            for (const guild of this.client.guilds.cache.values()) {
                const channels: ServerChannelInfo[] = [];

                // Get channels
                guild.channels.cache.forEach(channel => {
                    if (channel.isTextBased()) {
                        const permissions = channel.permissionsFor(this.client.user!);
                        channels.push({
                            id: channel.id,
                            name: channel.name,
                            type: channel.type.toString(),
                            canSendMessages: permissions?.has('SendMessages') ?? false,
                            canReadMessages: permissions?.has('ViewChannel') ?? false
                        });
                    }
                });

                // Get roles
                const roles = guild.roles.cache.map(role => ({
                    id: role.id,
                    name: role.name,
                    color: role.hexColor,
                    position: role.position
                }));

                servers.push({
                    id: guild.id,
                    name: guild.name,
                    memberCount: guild.memberCount,
                    ownerId: guild.ownerId,
                    channels,
                    roles
                });
            }

            return servers;
        } catch (error) {
            Logger.error("Error getting servers:", error);
            throw error;
        }
    }

    async getChannels(serverId: string): Promise<ServerChannelInfo[]> {
        try {
            const guild = await this.client.guilds.fetch(serverId);
            if (!guild) {
                throw new Error(`Server with ID ${serverId} not found`);
            }

            const channels: ServerChannelInfo[] = [];
            
            guild.channels.cache.forEach(channel => {
                if (channel.isTextBased()) {
                    const permissions = channel.permissionsFor(this.client.user!);
                    channels.push({
                        id: channel.id,
                        name: channel.name,
                        type: channel.type.toString(),
                        canSendMessages: permissions?.has('SendMessages') ?? false,
                        canReadMessages: permissions?.has('ViewChannel') ?? false
                    });
                }
            });

            return channels;
        } catch (error) {
            Logger.error(`Error getting channels for server ${serverId}:`, error);
            throw error;
        }
    }


    async getBotServerInfo(): Promise<void> {
        try {
            if (!this.client.user) {
                Logger.info("Bot is not logged in!");
                return;
            }
    
            // List all servers (guilds)
            Logger.info("\n=== BOT SERVER INFORMATION ===");
            Logger.info(`Bot Name: ${this.client.user.tag}`);
            Logger.info(`Bot ID: ${this.client.user.id}`);
            Logger.info(`Total Servers: ${this.client.guilds.cache.size}`);
    
            // Iterate through each server
            this.client.guilds.cache.forEach(guild => {
                Logger.info(`\n📌 SERVER: ${guild.name}`);
                Logger.info(`   ID: ${guild.id}`);
                Logger.info(`   Member Count: ${guild.memberCount}`);
                Logger.info(`   Owner ID: ${guild.ownerId}`);
                
                // List all channels in the server
                Logger.info("   CHANNELS:");
                guild.channels.cache.forEach(channel => {
                    if (channel.isTextBased()) {
                        Logger.info(`   📝 #${channel.name}`);
                        Logger.info(`      - ID: ${channel.id}`);
                        Logger.info(`      - Type: ${channel.type}`);
                        // Check if bot can send messages in this channel
                        const permissions = channel.permissionsFor(this.client.user!);
                        Logger.info(`      - Can Send Messages: ${permissions?.has('SendMessages')}`);
                        Logger.info(`      - Can Read Messages: ${permissions?.has('ViewChannel')}`);
                    }
                });
    
                // List roles
                Logger.info("   ROLES:");
                guild.roles.cache.forEach(role => {
                    Logger.info(`   👑 ${role.name}`);
                    Logger.info(`      - ID: ${role.id}`);
                    Logger.info(`      - Color: ${role.hexColor}`);
                    Logger.info(`      - Position: ${role.position}`);
                });
            });
    
        } catch (error) {
            Logger.error("Error getting server info:", error);
        }
    }

} 