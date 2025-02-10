import settings from "./settings";
import {
    type EmbeddingModelSettings,
    type ImageModelSettings,
    ModelClass,
    ModelProviderName,
    type Models,
    type ModelSettings,
} from "./types";

export const models: Models = {
    [ModelProviderName.OPENAI]: {
        endpoint: settings.OPENAI_API_URL || "https://api.openai.com/v1",
        model: {
            [ModelClass.SMALL]: {
                name: settings.SMALL_OPENAI_MODEL || "gpt-4o-mini",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.6,
            },
            [ModelClass.MEDIUM]: {
                name: settings.MEDIUM_OPENAI_MODEL || "gpt-4o",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.6,
            },
            [ModelClass.LARGE]: {
                name: settings.LARGE_OPENAI_MODEL || "gpt-4o",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.6,
            },
            [ModelClass.EMBEDDING]: {
                name:
                    settings.EMBEDDING_OPENAI_MODEL || "text-embedding-3-small",
                dimensions: 1536,
            },
            [ModelClass.IMAGE]: {
                name: settings.IMAGE_OPENAI_MODEL || "dall-e-3",
            },
        },
    },
    [ModelProviderName.GOOGLE]: {
        endpoint: "https://generativelanguage.googleapis.com",
        model: {
            [ModelClass.SMALL]: {
                name:
                    settings.SMALL_GOOGLE_MODEL ||
                    settings.GOOGLE_MODEL ||
                    "gemini-2.0-flash-exp",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.MEDIUM]: {
                name:
                    settings.MEDIUM_GOOGLE_MODEL ||
                    settings.GOOGLE_MODEL ||
                    "gemini-2.0-flash-exp",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.LARGE]: {
                name:
                    settings.LARGE_GOOGLE_MODEL ||
                    settings.GOOGLE_MODEL ||
                    "gemini-2.0-flash-exp",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.EMBEDDING]: {
                name:
                    settings.EMBEDDING_GOOGLE_MODEL ||
                    settings.GOOGLE_MODEL ||
                    "text-embedding-004",
            },
        },
    },
    [ModelProviderName.MISTRAL]: {
        model: {
            [ModelClass.SMALL]: {
                name:
                    settings.SMALL_MISTRAL_MODEL ||
                    settings.MISTRAL_MODEL ||
                    "mistral-small-latest",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.MEDIUM]: {
                name:
                    settings.MEDIUM_MISTRAL_MODEL ||
                    settings.MISTRAL_MODEL ||
                    "mistral-large-latest",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.LARGE]: {
                name:
                    settings.LARGE_MISTRAL_MODEL ||
                    settings.MISTRAL_MODEL ||
                    "mistral-large-latest",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
        },
    },    
    [ModelProviderName.DEEPSEEK]: {
        endpoint: settings.DEEPSEEK_API_URL || "https://api.deepseek.com",
        model: {
            [ModelClass.SMALL]: {
                name: settings.SMALL_DEEPSEEK_MODEL || "deepseek-chat",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.7,
            },
            [ModelClass.MEDIUM]: {
                name: settings.MEDIUM_DEEPSEEK_MODEL || "deepseek-chat",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.7,
            },
            [ModelClass.LARGE]: {
                name: settings.LARGE_DEEPSEEK_MODEL || "deepseek-chat",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.7,
            },
        },
    },    
    [ModelProviderName.ATOMA]: {
        endpoint: settings.ATOMA_API_URL || "https://api.atoma.network/v1",
        model: {
            [ModelClass.SMALL]: {
                name:
                    settings.SMALL_ATOMA_MODEL ||
                    "meta-llama/Llama-3.3-70B-Instruct",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                temperature: 0.7,
            },
            [ModelClass.MEDIUM]: {
                name:
                    settings.MEDIUM_ATOMA_MODEL ||
                    "meta-llama/Llama-3.3-70B-Instruct",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                temperature: 0.7,
            },
            [ModelClass.LARGE]: {
                name:
                    settings.LARGE_ATOMA_MODEL ||
                    "meta-llama/Llama-3.3-70B-Instruct",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                temperature: 0.7,
            },
        },
    },
};

export function getModelSettings(
    provider: ModelProviderName,
    type: ModelClass
): ModelSettings {
    return (models as any)[provider]?.model[type] as ModelSettings;
}

export function getImageModelSettings(
    provider: ModelProviderName
): ImageModelSettings | undefined {
    return (models as any)[provider]?.model[ModelClass.IMAGE] as
        | ImageModelSettings
        | undefined;
}

export function getEmbeddingModelSettings(
    provider: ModelProviderName
): EmbeddingModelSettings | undefined {
    return (models as any)[provider]?.model[ModelClass.EMBEDDING] as
        | EmbeddingModelSettings
        | undefined;
}

export function getEndpoint(provider: ModelProviderName) {
    return (models as any)[provider].endpoint;
}
