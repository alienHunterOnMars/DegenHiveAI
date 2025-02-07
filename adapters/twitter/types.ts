export interface TwitterConfig {
    // ... existing config
    messageBroker?: {
        url: string;
        exchange: string;
    };
} 