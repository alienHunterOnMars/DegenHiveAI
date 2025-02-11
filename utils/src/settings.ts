import { Logger } from "./logger";

 
 
interface Settings {
    [key: string]: string | undefined;
}

interface NamespacedSettings {
    [namespace: string]: Settings;
}

let environmentSettings: Settings = {};

 

 
/**
 * Configures environment settings for browser usage
 * @param {Settings} settings - Object containing environment variables
 */
export function configureSettings(settings: Settings) {
    environmentSettings = { ...settings };
}

/**
 * Loads environment variables from the nearest .env file in Node.js
 * or returns configured settings in browser
 * @returns {Settings} Environment variables object
 * @throws {Error} If no .env file is found in Node.js environment
 */
export function loadEnvConfig(): Settings {
    return {};
}

 

// Initialize settings based on environment
export const settings = loadEnvConfig();

Logger.info("Parsed settings:", {
    USE_OPENAI_EMBEDDING: settings.USE_OPENAI_EMBEDDING,
    USE_OPENAI_EMBEDDING_TYPE: typeof settings.USE_OPENAI_EMBEDDING,
    USE_OLLAMA_EMBEDDING: settings.USE_OLLAMA_EMBEDDING,
    USE_OLLAMA_EMBEDDING_TYPE: typeof settings.USE_OLLAMA_EMBEDDING,
    OLLAMA_EMBEDDING_MODEL:
        settings.OLLAMA_EMBEDDING_MODEL || "mxbai-embed-large",
});

export default settings;
 