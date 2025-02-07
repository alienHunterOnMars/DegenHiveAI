export interface TelegramConfig {
    token: string;
    founderChatId: string;
    groupChatId: string;
    messageBroker?: {
        url: string;
        exchange: string;
    };
} 