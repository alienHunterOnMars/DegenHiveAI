import { Client, TextChannel, EmbedBuilder, Message } from "discord.js";
import { Logger, RedisClient } from "@hiveai/utils";
import { DiscordConfig, AnnouncementOptions } from "../types";
 
interface PendingAnnouncement {
    id: string;
    content: string;
    options?: AnnouncementOptions;
    timestamp: number;
    status: 'pending' | 'approved' | 'rejected';
    approvalMessageId?: string; // Telegram message ID for tracking
}

export class AnnouncementHandler {
    private client: Client;
    private config: DiscordConfig;
    private pendingAnnouncements: Map<string, PendingAnnouncement> = new Map();
        
    constructor(client: Client, config: DiscordConfig) {
        this.client = client;
        this.config = config;
    }

    // Make an announcement to the announcement channel
    async makeAnnouncement(content: string, options?: { pingRole?: string }): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(this.config.announcementChannelId);
            if (channel?.isTextBased()) {
                const announcement = options?.pingRole 
                    ? `<@&${options.pingRole}> ${content}`
                    : content;
                await (channel as TextChannel).send(announcement);
            }
        } catch (error) {
            Logger.error("Error making announcement:", error);
        }
    } 
} 