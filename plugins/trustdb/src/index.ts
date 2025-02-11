import { Logger } from '@hiveai/utils';
import { TrustScoreDatabase } from './trustScoreDatabase';

// Re-export everything from trustScoreDatabase
export * from './trustScoreDatabase';

export interface TrustDBConfig {
    apiUrl: string;
    apiKey: string;
    db: any;
}

const trustDBPlugin = {
    name: 'trustdb',
    
    async init(config: TrustDBConfig) {
        try {
            const db = new TrustScoreDatabase(config);
            await db.connect();
            Logger.info('TrustDB Plugin: Initialized successfully');
        } catch (error) {
            Logger.error('TrustDB Plugin: Failed to initialize:', error);
            throw error;
        }
    },

    async start() {
        Logger.info('TrustDB Plugin: Started');
    },

    async stop() {
        Logger.info('TrustDB Plugin: Stopped');
    }
};

export default trustDBPlugin;
