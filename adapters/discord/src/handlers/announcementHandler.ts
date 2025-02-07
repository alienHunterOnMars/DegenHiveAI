import { Client, TextChannel, EmbedBuilder, Message } from "discord.js";
import { Logger } from "@hiveai/utils";
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
    
    // Cache announcement channel to avoid repeated fetches
    private announcementChannel: TextChannel | null = null;

    constructor(client: Client, config: DiscordConfig) {
        this.client = client;
        this.config = config;
    }

    private async initializeAnnouncementChannel(): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(this.config.announcementChannelId);
            if (channel?.isTextBased()) {
                this.announcementChannel = channel as TextChannel;
            } else {
                throw new Error("Announcement channel is not a text channel");
            }
        } catch (error) {
            Logger.error("Failed to initialize announcement channel:", error);
        }
    }

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

    private async requestFounderApproval(announcement: PendingAnnouncement): Promise<void> {
        try {
            // Format the approval request message
            const approvalMessage = this.formatApprovalRequest(announcement);

            // Send to founder via Telegram with inline keyboard
            // const telegramMessage = await this.telegramAdapter.sendFounderMessage(
            //     approvalMessage,
            //     {
            //         reply_markup: {
            //             inline_keyboard: [[
            //                 { text: "✅ Approve", callback_data: `approve_${announcement.id}` },
            //                 { text: "❌ Reject", callback_data: `reject_${announcement.id}` },
            //                 { text: "✏️ Edit", callback_data: `edit_${announcement.id}` }
            //             ]]
            //         }
            //     }
            // );

            // Store Telegram message ID for tracking
            // announcement.approvalMessageId = telegramMessage.message_id;
            // this.pendingAnnouncements.set(announcement.id, announcement);

            // Set up expiration timer (24 hours)
            setTimeout(() => {
                this.handleAnnouncementExpiration(announcement.id);
            }, 24 * 60 * 60 * 1000);

        } catch (error) {
            Logger.error("Error requesting founder approval:", error);
            throw error;
        }
    }

    private formatApprovalRequest(announcement: PendingAnnouncement): string {
        const priority = announcement.options?.priority || 'normal';
        const pingRole = announcement.options?.pingRole ? `@${announcement.options.pingRole}` : 'No role ping';

        return `🔔 *New Announcement Request*\n\n` +
               `*Content:*\n${announcement.content}\n\n` +
               `*Details:*\n` +
               `• Priority: ${priority}\n` +
               `• Role Ping: ${pingRole}\n` +
               `• ID: \`${announcement.id}\`\n\n` +
               `Please approve, reject, or edit this announcement.`;
    }

    async handleFounderResponse(action: string, messageId: string, content?: string): Promise<void> {
        // Handle founder responses to announcements
    }

    async handleMessage(message: any): Promise<void> {
        // Handle announcement channel messages
    }

    private async publishAnnouncement(announcement: PendingAnnouncement): Promise<void> {
        try {
            if (!this.announcementChannel) {
                throw new Error("Announcement channel not available");
            }

            // Create rich embed for the announcement
            const embed = new EmbedBuilder()
                .setColor(this.getPriorityColor(announcement.options?.priority))
                .setDescription(announcement.content)
                .setTimestamp();

            // Add role mention if specified
            const roleMention = announcement.options?.pingRole ? 
                `<@&${announcement.options.pingRole}>` : '';

            // // Send the announcement
            // await this.announcementChannel.send({
            //     content: roleMention,
            //     embeds: [embed]
            // });

            // // Notify founder of successful publication
            // await this.telegramAdapter.sendFounderMessage(
            //     `✅ Announcement published successfully!\n\n${announcement.content}`
            // );

            Logger.info("Announcement published:", announcement.id);

        } catch (error) {
            Logger.error("Error publishing announcement:", error);
            throw error;
        }
    }

    private async handleRejectedAnnouncement(announcement: PendingAnnouncement): Promise<void> {
        try {
            // // Notify founder of rejection
            // await this.telegramAdapter.sendFounderMessage(
            //     `❌ Announcement rejected:\n\n${announcement.content}`
            // );

            Logger.info("Announcement rejected:", announcement.id);

        } catch (error) {
            Logger.error("Error handling rejected announcement:", error);
            throw error;
        }
    }

    private async handleAnnouncementExpiration(announcementId: string): Promise<void> {
        const announcement = this.pendingAnnouncements.get(announcementId);
        if (announcement && announcement.status === 'pending') {
            try {
                // // Notify founder of expiration
                // await this.telegramAdapter.sendFounderMessage(
                //     `⚠️ Announcement request expired:\n\n${announcement.content}`
                // );

                this.pendingAnnouncements.delete(announcementId);
                Logger.info("Announcement expired:", announcementId);

            } catch (error) {
                Logger.error("Error handling announcement expiration:", error);
            }
        }
    }

    private getPriorityColor(priority?: string): number {
        switch (priority) {
            case 'high':
                return 0xFF0000; // Red
            case 'medium':
                return 0xFFA500; // Orange
            case 'low':
                return 0x00FF00; // Green
            default:
                return 0x0099FF; // Blue
        }
    }
} 