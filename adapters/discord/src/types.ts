export interface DiscordConfig {
    token: string;
    guildId: string;
    announcementChannelId: string;
    alphaChannelId: string;
    memeChannelId: string;
    messageBroker?: {
        url: string;
        exchange: string;
    };
}

export interface DiscordMessage {
    id: string;
    content: string;
    author: string;
    channelId: string;
    guildId?: string;
    timestamp: number;
}

export interface AnnouncementOptions {
    pingRole?: string;
    requireFounderApproval?: boolean;
    priority?: 'low' | 'medium' | 'high';
}

export interface DragonbeeState {
    id: string;
    name: string;
    type: string;
    level: number;
    experience: number;
    energyLevel: number;
    mood: 'happy' | 'neutral' | 'tired' | 'grumpy';
    personality: DragonbeePersonality;
    lastInteraction: number;
}

export interface DragonbeePersonality {
    traits: {
        playfulness: number;
        helpfulness: number;
        curiosity: number;
        assertiveness: number;
    };
    interests: string[];
    preferences: {
        [key: string]: number;
    };
}

export interface InteractionResponse {
    text: string;
    dragonbeeId: string | null;
    mood: string;
    actionType?: string;
}

export interface EngagementMetrics {
    messageCount: number;
    uniqueUsers: Set<string>;
    reactionCount: number;
    topicEngagement: Map<string, number>;
    lastActivity: number;
}

export interface CommunityStats {
    messageCount: number;
    uniqueUsers: number;
    reactionCount: number;
    topTopics: string[];
    lastActivity: Date | null;
} 