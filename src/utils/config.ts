import * as fs from 'fs';
import { Logger } from '@hiveai/utils';

// Load environment variables
// dotenv.config();

/**
 * Loads and validates the application configuration from environment variables
 */
export function loadConfig() {
    try {
        const configPath = process.env.CONFIG_PATH || './config.json';
        if (!fs.existsSync(configPath)) {
            Logger.warn(`Config file not found at ${configPath}, using defaults`);
            return {};
        }
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config;
    } catch (error) {
        Logger.error('Error loading config:', error);
        return {};
    }
} 