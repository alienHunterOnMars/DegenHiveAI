import { Client, Message, MessageReaction, User, TextChannel, EmbedBuilder } from "discord.js";
import { Logger } from "../../../utils/logger";
import { EngagementMetrics, CommunityStats } from "../types";
import { OpenAIService } from "../../../services/openAIService";

interface EngagementConfig {
    minTimeBetweenMessages: number;  // Minimum time between bot messages (ms)
    maxDailyMessages: number;        // Maximum messages per day per channel
    responseChance: number;          // Base chance to respond (0-1)
    topicBoostMultiplier: number;    // Multiplier for relevant topics
    quietHoursStart: number;         // Hour to start reducing activity (0-23)
    quietHoursEnd: number;           // Hour to resume normal activity (0-23)
}

export class CommunityHandler {
    private client: Client;
    private openAI: OpenAIService;
    private lastMessageTime: Map<string, number> = new Map();
    private dailyMessageCount: Map<string, number> = new Map();
    private activeDiscussions: Map<string, string[]> = new Map();
    private engagementMetrics: Map<string, EngagementMetrics> = new Map();
    
    private config: EngagementConfig = {
        minTimeBetweenMessages: 5 * 60 * 1000,  // 5 minutes
        maxDailyMessages: 50,
        responseChance: 0.3,
        topicBoostMultiplier: 1.5,
        quietHoursStart: 1,  // 1 AM
        quietHoursEnd: 7     // 7 AM
    };

    constructor(client: Client) {
        this.client = client;
        this.openAI = new OpenAIService();
        this.setupDailyReset();
    }

    async handleMessage(message: Message): Promise<void> {
        try {
            // Update engagement metrics
            await this.updateEngagementMetrics(message);

            // Check if we should engage
            if (await this.shouldEngageWithMessage(message)) {
                await this.generateCommunityResponse(message);
            }

            // Track active discussions
            await this.updateActiveDiscussions(message);

            // Periodically check for opportunities to revive dead discussions
            await this.checkForRevivalOpportunities(message.channelId);

        } catch (error) {
            Logger.error("Error handling community message:", error);
        }
    }

    async handleReaction(reaction: MessageReaction, user: User): Promise<void> {
        try {
            // Track reaction metrics
            await this.updateReactionMetrics(reaction, user);

            // Check if this reaction indicates high engagement
            if (await this.isHighEngagementReaction(reaction)) {
                await this.handleHighEngagementReaction(reaction);
            }

        } catch (error) {
            Logger.error("Error handling reaction:", error);
        }
    }

    private async updateEngagementMetrics(message: Message): Promise<void> {
        const channelId = message.channelId;
        const currentMetrics = this.engagementMetrics.get(channelId) || {
            messageCount: 0,
            uniqueUsers: new Set(),
            reactionCount: 0,
            topicEngagement: new Map(),
            lastActivity: Date.now()
        };

        currentMetrics.messageCount++;
        currentMetrics.uniqueUsers.add(message.author.id);
        currentMetrics.lastActivity = Date.now();

        // Update topic engagement
        const topics = await this.detectTopics(message.content);
        topics.forEach(topic => {
            const current = currentMetrics.topicEngagement.get(topic) || 0;
            currentMetrics.topicEngagement.set(topic, current + 1);
        });

        this.engagementMetrics.set(channelId, currentMetrics);
    }

    private async shouldEngageWithMessage(message: Message): Promise<boolean> {
        const channelId = message.channelId;
        const now = new Date();
        const hour = now.getHours();

        // Check quiet hours
        if (hour >= this.config.quietHoursStart && hour < this.config.quietHoursEnd) {
            return false;
        }

        // Check rate limits
        const lastMessage = this.lastMessageTime.get(channelId) || 0;
        if (now.getTime() - lastMessage < this.config.minTimeBetweenMessages) {
            return false;
        }

        // Check daily message limit
        const dailyCount = this.dailyMessageCount.get(channelId) || 0;
        if (dailyCount >= this.config.maxDailyMessages) {
            return false;
        }

        // Calculate engagement probability
        let probability = this.config.responseChance;

        // Boost probability for relevant topics
        const topics = await this.detectTopics(message.content);
        const isRelevantTopic = topics.some(topic => 
            this.isTopicRelevant(topic)
        );
        if (isRelevantTopic) {
            probability *= this.config.topicBoostMultiplier;
        }

        // Boost probability for inactive channels
        const metrics = this.engagementMetrics.get(channelId);
        if (metrics && now.getTime() - metrics.lastActivity > 30 * 60 * 1000) { // 30 minutes
            probability *= 1.2;
        }

        return Math.random() < probability;
    }

    private async generateCommunityResponse(message: Message): Promise<void> {
        try {
            const channelContext = await this.getChannelContext(message.channel as TextChannel);
            const recentMessages = await this.getRecentMessages(message.channel as TextChannel);

            // Generate response using OpenAI
            const response = await this.openAI.generateCommunityResponse(
                message.content,
                channelContext,
                recentMessages
            );

            if (response) {
                await message.channel.send(response);
                
                // Update tracking
                this.lastMessageTime.set(message.channelId, Date.now());
                this.dailyMessageCount.set(
                    message.channelId,
                    (this.dailyMessageCount.get(message.channelId) || 0) + 1
                );
            }

        } catch (error) {
            Logger.error("Error generating community response:", error);
        }
    }

    private async updateActiveDiscussions(message: Message): Promise<void> {
        const channelId = message.channelId;
        const topics = await this.detectTopics(message.content);
        
        const currentTopics = this.activeDiscussions.get(channelId) || [];
        this.activeDiscussions.set(channelId, [...new Set([...currentTopics, ...topics])]);

        // Expire old topics after 30 minutes
        setTimeout(() => {
            const topics = this.activeDiscussions.get(channelId) || [];
            topics.splice(topics.indexOf(message.content), 1);
            this.activeDiscussions.set(channelId, topics);
        }, 30 * 60 * 1000);
    }

    private async checkForRevivalOpportunities(channelId: string): Promise<void> {
        const metrics = this.engagementMetrics.get(channelId);
        if (!metrics) return;

        const inactiveThreshold = 60 * 60 * 1000; // 1 hour
        if (Date.now() - metrics.lastActivity > inactiveThreshold) {
            const topics = Array.from(metrics.topicEngagement.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([topic]) => topic);

            if (topics.length > 0) {
                const channel = await this.client.channels.fetch(channelId) as TextChannel;
                if (channel) {
                    const revivalMessage = await this.generateRevivalMessage(topics);
                    await channel.send(revivalMessage);
                }
            }
        }
    }

    private async generateRevivalMessage(topics: string[]): Promise<string> {
        // Use OpenAI to generate a natural conversation revival message
        const prompt = `Generate an engaging message to revive a conversation about: ${topics.join(", ")}`;
        return await this.openAI.generateText(prompt);
    }

    private async detectTopics(content: string): Promise<string[]> {
        // Use OpenAI to detect topics from message content
        const topics = await this.openAI.detectTopics(content);
        return topics;
    }

    private isTopicRelevant(topic: string): boolean {
        const relevantTopics = [
            "crypto", "trading", "dragonbee", "nft", "blockchain",
            "market", "investment", "community", "gaming"
        ];
        return relevantTopics.some(t => 
            topic.toLowerCase().includes(t.toLowerCase())
        );
    }

    private setupDailyReset(): void {
        // Reset daily message counts at midnight
        const now = new Date();
        const night = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1,
            0, 0, 0
        );
        const msToMidnight = night.getTime() - now.getTime();

        setTimeout(() => {
            this.dailyMessageCount.clear();
            // Set up next day's reset
            setInterval(() => {
                this.dailyMessageCount.clear();
            }, 24 * 60 * 60 * 1000);
        }, msToMidnight);
    }

    async getCommunityStats(channelId: string): Promise<CommunityStats> {
        const metrics = this.engagementMetrics.get(channelId);
        if (!metrics) {
            return {
                messageCount: 0,
                uniqueUsers: 0,
                reactionCount: 0,
                topTopics: [],
                lastActivity: null
            };
        }

        const topTopics = Array.from(metrics.topicEngagement.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([topic]) => topic);

        return {
            messageCount: metrics.messageCount,
            uniqueUsers: metrics.uniqueUsers.size,
            reactionCount: metrics.reactionCount,
            topTopics,
            lastActivity: new Date(metrics.lastActivity)
        };
    }
} 