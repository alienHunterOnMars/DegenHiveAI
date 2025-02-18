export interface TelegramConfig {
    token: string;
    founderChatId: string;
    communityChatId: string;
    messageBroker?: {
        url: string;
        exchange: string;
    };
} 