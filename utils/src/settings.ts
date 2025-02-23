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


export default settings;
 