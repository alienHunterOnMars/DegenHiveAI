/**
 * Improved and scalable entry point for DegenHive AI Swarm.
 *
 * This version introduces:
 * - A Plugin system (via PluginManager and IPlugin interface)
 * - Dependency injection for core components (event bus, adapters, services)
 * - Modular initialization routines for global agents and direct chat capabilities
 * - Dynamic port assignment
 * - Better error handling and logging
 *
 * Future extensions (such as reinforcement learning, RAG capabilities, voice channels, etc.)
 * can be implemented as plugins and registered via the PLUGINS environment variable.
 */

//  && npm run build:adapters

import { Logger } from '@hiveai/utils';
// import { KafkaEventBus } from './infrastructure/KafkaEventBus';
// import { RedisClient } from './infrastructure/RedisClient';
// import { ServiceRegistry } from './infrastructure/ServiceRegistry';
// import { AgentOrchestrator } from './services/agent-orchestrator/AgentOrchestrator';
// import { MessageOrchestrator } from './services/message-orchestrator/MessageOrchestrator';
// import { DiscordAdapter } from "@hiveai/adapters-discord";
// import { TelegramAdapter } from '@hiveai/adapters-telegram';
// import { RedditAdapter } from '@hiveai/adapters-reddit';
// import { TwitterAdapter } from '@hiveai/adapters-twitter';
// import { FarcasterAdapter } from '@hiveai/adapters-farcaster';
// import { EmailAdapter } from '@hiveai/adapters-email';
import dotenv from 'dotenv';
import { loadConfig } from './utils/config';
import * as fs from 'fs';
// import { solanaPlugin } from '@hiveai/plugin-solana';
// import { suiPlugin } from '@hiveai/plugin-sui';
// import { hyperliquidPlugin } from '@hiveai/plugin-hyperliquid';
import trustDBPlugin from '@hiveai/plugin-trustdb';

dotenv.config();

// Add this at the very top of the file, after imports
console.log('Raw console.log test');
Logger.info('Logger test');

// ----------------------------------------------------------------------------
// Plugin Interfaces and Manager
// ----------------------------------------------------------------------------

export interface IPlugin {
    name: string;
    init?(context?: any): Promise<void>;
    start?(context?: any): Promise<void>;
    healthCheck?(): Promise<boolean>;
    stop?(): Promise<void>;
}

/**
 * PluginManager is responsible for loading, initializing, and starting
 * plugins from module paths provided via an environment variable.
 *
 * For example, you can define:
 *   PLUGINS=@myorg/plugin-telegram,@myorg/plugin-discord
 *
 * Each plugin should export a default object that adheres to the IPlugin interface.
 */
class PluginManager {
    private plugins: IPlugin[] = [];

    /**
     * Loads plugin modules from a comma-separated list in process.env.PLUGINS.
     */
    async loadPlugins(): Promise<void> {
        const pluginsList = process.env.PLUGINS ? process.env.PLUGINS.split(",") : [];
        for (const pluginPath of pluginsList) {
            try {
                const module = await import(pluginPath.trim());
                const plugin: IPlugin = module.default;
                this.plugins.push(plugin);
                Logger.info(`Plugin loaded: ${plugin.name}`);
            } catch (error) {
                Logger.error(`Failed to load plugin at ${pluginPath}:`, error);
            }
        }
    }

    /**
     * Runs the `init` method on every plugin, passing in a shared context.
     */
    async initializePlugins(context: any): Promise<void> {
        for (const plugin of this.plugins) {
            if (plugin.init) {
                await plugin.init(context);
                Logger.info(`Plugin initialized: ${plugin.name}`);
            }
        }
    }

    /**
     * Runs the `start` method on every plugin, passing in the same shared context.
     */
    async startPlugins(context: any): Promise<void> {
        for (const plugin of this.plugins) {
            if (plugin.start) {
                await plugin.start(context);
                Logger.info(`Plugin started: ${plugin.name}`);
            }
        }
    }

    getPlugins(): IPlugin[] {
        return this.plugins;
    }
}

// ----------------------------------------------------------------------------
// Core Startup Logic
// ----------------------------------------------------------------------------

class HiveSwarm {
    private config: any;
    private adapters: Map<string, any>;
    private plugins: Map<string, IPlugin>;
    // private eventBus: KafkaEventBus;
    // private redis: RedisClient;
    // private registry: ServiceRegistry;
    // private agentOrchestrator: AgentOrchestrator;
    // private messageOrchestrator: MessageOrchestrator;
    private isShuttingDown: boolean = false;

    constructor() {
        // Load configuration
        this.config = loadConfig();
        
        // Initialize infrastructure
        this.adapters = new Map();
        // this.eventBus = new KafkaEventBus(this.config.infrastructure.kafka);
        // this.redis = new RedisClient(this.config.infrastructure.redis);
        // this.registry = new ServiceRegistry(this.redis);

        // Initialize orchestrators
        // this.agentOrchestrator = new AgentOrchestrator(
        //     this.eventBus,
        //     this.registry,
        //     this.redis,
        //     this.config.sharding.shardId || 'shard-1'
        // );

        // this.messageOrchestrator = new MessageOrchestrator(
        //     this.eventBus,
        //     this.registry,
        //     this.redis,
        //     this.agentOrchestrator
        // );

        this.plugins = new Map();
    }

    async start() {
        try {
            Logger.info('Starting HiveAI Swarm...');

            // Initialize plugins first
            await this.initializePlugins();

            // Connect infrastructure
            await this.connectInfrastructure();

            // Initialize and start adapters
            await this.initializeAdapters();

            // Start plugins
            await this.startPlugins();

            // Setup health monitoring
            this.setupHealthMonitoring();

            // Handle shutdown
            this.setupShutdownHandlers();

            Logger.success('HiveAI Swarm started successfully!');
        } catch (error) {
            Logger.error('Failed to start HiveAI Swarm:', error);
            await this.shutdown(1);
        }
    }

    private async initializePlugins(): Promise<void> {
        try {
            Logger.info('Initializing plugins...');

            // Initialize core plugins
            const corePlugins = [
                // { name: 'solana', plugin: solanaPlugin },
                // { name: 'sui', plugin: suiPlugin },
                // { name: 'hyperliquid', plugin: hyperliquidPlugin },
                { name: 'trustdb', plugin: trustDBPlugin }
            ];

            for (const { name, plugin } of corePlugins) {
                if (this.config.plugins.enabled.includes(name)) {
                    try {
                        const pluginConfig = this.config.plugins.config[name] || {};
                        await plugin.init?.(pluginConfig);
                        this.plugins.set(name, plugin);
                        Logger.info(`Plugin initialized: ${name}`);
                    } catch (error) {
                        Logger.error(`Failed to initialize plugin ${name}:`, error);
                    }
                }
            }

            // Initialize any additional plugins from env config
            const additionalPlugins = this.config.plugins.enabled
                .filter((name: string) => !corePlugins.find((p: any) => p.name === name));

            for (const pluginName of additionalPlugins) {
                try {
                    const plugin = await import(pluginName);
                    await plugin.init?.(this.config.plugins.config[pluginName]);
                    this.plugins.set(pluginName, plugin);
                    Logger.info(`Additional plugin initialized: ${pluginName}`);
                } catch (error) {
                    Logger.error(`Failed to initialize plugin ${pluginName}:`, error);
                }
            }

        } catch (error) {
            Logger.error('Failed to initialize plugins:', error);
            throw error;
        }
    }

    private async startPlugins(): Promise<void> {
        try {
            Logger.info('Starting plugins...');

            for (const [name, plugin] of this.plugins.entries()) {
                try {
                    await plugin.start?.();
                    Logger.info(`Plugin started: ${name}`);
                } catch (error) {
                    Logger.error(`Failed to start plugin ${name}:`, error);
                }
            }

        } catch (error) {
            Logger.error('Failed to start plugins:', error);
            throw error;
        }
    }

    private async connectInfrastructure(): Promise<void> {
        try {
            // await this.eventBus.connect();
            // await this.registry.connect();
        } catch (error) {
            Logger.error('Failed to connect infrastructure:', error);
            throw error;
        }
    }

    private async initializeAdapters(): Promise<void> {
        try {

            const envData = fs.readFileSync('./env.json', 'utf8');
            const envConfig = JSON.parse(envData);
            Logger.info('Successfully loaded env.json configuration');


            // // Initialize Discord adapter
            // if (envConfig.discord) {
            //     const discordAdapter = new DiscordAdapter({
            //         ...envConfig.discord,
            //         messageBroker: {
            //             url: this.config.infrastructure.kafka.brokers.join(','),
            //             exchange: 'social.messages'
            //         }
            //     });
            //     this.adapters.set('discord', discordAdapter);
            // }

            // // Initialize Telegram adapter
            // if (this.config.telegram) {
            //     const telegramAdapter = new TelegramAdapter({
            //         ...envConfig.telegram,
            //         messageBroker: {
            //             url: this.config.infrastructure.kafka.brokers.join(','),
            //             exchange: 'social.messages'
            //         }
            //     });
            //     this.adapters.set('telegram', telegramAdapter);
            // }

            // // Initialize Reddit adapter
            // if (envConfig.reddit) {
            //     const redditAdapter = new RedditAdapter({
            //         ...envConfig.reddit,
            //         messageBroker: {
            //             url: this.config.infrastructure.kafka.brokers.join(','),
            //             exchange: 'social.messages'
            //         }
            //     });
            //     this.adapters.set('reddit', redditAdapter);
            // }

            // // Initialize Farcaster adapter
            // if (envConfig.farcaster) {
            //     const farcasterAdapter = new FarcasterAdapter({
            //         ...envConfig.farcaster,
            //         messageBroker: {
            //             url: this.config.infrastructure.kafka.brokers.join(','),
            //             exchange: 'social.messages'
            //         }
            //     });
            //     this.adapters.set('farcaster', farcasterAdapter);
            // }

            // // Initialize Email adapter
            // if (envConfig.email) {
            //     const emailAdapter = new EmailAdapter({
            //         ...envConfig.email,
            //         messageBroker: {
            //             url: this.config.infrastructure.kafka.brokers.join(','),
            //             exchange: 'social.messages'
            //         }
            //     });
            //     this.adapters.set('email', emailAdapter);
            // }

            // // Initialize Twitter adapter
            // if (envConfig.twitter) {
            //     const twitterAdapter = new TwitterAdapter({
            //         ...envConfig.twitter,
            //         messageBroker: {
            //             url: this.config.infrastructure.kafka.brokers.join(','),
            //             exchange: 'social.messages'
            //         }
            //     });
            //     this.adapters.set('twitter', twitterAdapter);
            // }

            await Promise.all([...this.adapters.values()].map(adapter => adapter.start()));
        } catch (error) {
            Logger.error('Failed to initialize adapters:', error);
            throw error;
        }
    }

    private async startOrchestrators(): Promise<void> {
        try {
            // await this.agentOrchestrator.start();
            // await this.messageOrchestrator.start();
        } catch (error) {
            Logger.error('Failed to start orchestrators:', error);
            throw error;
        }
    }

    private setupHealthMonitoring(): void {
        setInterval(async () => {
            try {
                const health = await this.checkHealth();
                if (!health.healthy) {
                    Logger.error('Health check failed:', health.issues);
                }
            } catch (error) {
                Logger.error('Health check error:', error);
            }
        }, 30000); // Every 30 seconds
    }

    private async checkHealth(): Promise<{ healthy: boolean; issues: string[] }> {
        const issues: string[] = [];

        // Check event bus
        // if (!await this.eventBus.healthCheck()) {
        //     issues.push('EventBus unhealthy');
        // }

        // Check Redis
        // if (!await this.redis.healthCheck()) {
        //     issues.push('Redis unhealthy');
        // }

        // Check adapters
        // for (const [name, adapter] of this.adapters.entries()) {
        //     if (!await adapter.healthCheck()) {
        //         issues.push(`${name} adapter unhealthy`);
        //     }
        // }

        // Check plugins
        for (const [name, plugin] of this.plugins.entries()) {
            if (plugin.healthCheck && !(await plugin.healthCheck())) {
                issues.push(`Plugin ${name} unhealthy`);
            }
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }

    private setupShutdownHandlers(): void {
        const shutdown = async (code: number = 0) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            Logger.info('Shutting down HiveAI Swarm...');
            
            try {
                // Stop all adapters
                await Promise.all([...this.adapters.values()].map(adapter => adapter.stop()));
                
                // Stop orchestrators
                // await this.messageOrchestrator.stop();
                // await this.agentOrchestrator.stop();

                // Disconnect infrastructure
                // await this.eventBus.disconnect();
                // await this.redis.disconnect();
                // await this.registry.disconnect();
                
                Logger.success('HiveAI Swarm shutdown complete');
            } catch (error) {
                Logger.error('Error during shutdown:', error);
            } finally {
                process.exit(code);
            }
        };

        // Handle graceful shutdown
        process.on('SIGTERM', () => shutdown());
        process.on('SIGINT', () => shutdown());
        process.on('uncaughtException', (error) => {
            Logger.error('Uncaught exception:', error);
            shutdown(1);
        });
    }

    private async shutdown(code: number = 0): Promise<never> {
        if (this.isShuttingDown) {
            process.exit(code);
        }
        
        this.isShuttingDown = true;
        
        try {
            Logger.info('Initiating shutdown sequence...');
            
            // Stop accepting new requests
            // await this.messageOrchestrator.stop();
            
            // Wait for pending operations to complete (with timeout)
            await Promise.race([
                this.waitForPendingOperations(),
                new Promise(resolve => setTimeout(resolve, 10000)) // 10s timeout
            ]);
            
            // Force shutdown
            await this.forceShutdown();
            
        } catch (error) {
            Logger.error('Error during shutdown:', error);
        } finally {
            process.exit(code);
        }
    }

    private async waitForPendingOperations(): Promise<void> {
        // Wait for pending trades to complete
        // Wait for active agent operations
        // etc.
    }

    private async forceShutdown(): Promise<void> {
        await Promise.allSettled([
            ...Array.from(this.adapters.values()).map(adapter => adapter.stop()),
            ...Array.from(this.plugins.values()).map(plugin => plugin.stop?.())
        ]);
    }
}

// Create and start the swarm
const hiveSwarm = new HiveSwarm();
hiveSwarm.start().catch(() => process.exit(1));

// Prevent unhandled promise rejections from crashing the process
process.on('unhandledRejection', (error) => {
    Logger.error('Unhandled rejection:', error);
});

export { HiveSwarm }; 