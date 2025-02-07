export interface RedditConfig {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    monitoredSubreddits: string[];
    autoReplyEnabled: boolean;
    postApprovalRequired: boolean;
    messageBroker?: {
        url: string;
        exchange: string;
    };
}

export interface RedditPost {
    subreddit: string;
    title: string;
    content: string;
    type: 'text' | 'link';
    flair?: string;
}

export interface PendingPost extends RedditPost {
    id: string;
    timestamp: number;
    status: 'pending' | 'approved' | 'rejected';
    approvalMessageId?: string;
}

export interface SubredditStats {
    subscribers: number;
    activeUsers: number;
    postCount: number;
    commentCount: number;
    topKeywords: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
} 