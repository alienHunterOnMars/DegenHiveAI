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

import { DiscordAdapter } from "@hiveai/adapters-discord";
import { Logger } from "./utils/logger";
import { readFileSync } from 'fs';
import { TelegramAdapter } from '@hiveai/adapters-telegram';
import { RedditAdapter } from '@hiveai/adapters-reddit';
import { TwitterAdapter } from '@hiveai/adapters-twitter';
import { FarcasterAdapter } from '@hiveai/adapters-farcaster';
import { EmailAdapter } from '@hiveai/adapters-email';

// ----------------------------------------------------------------------------
// Plugin Interfaces and Manager
// ----------------------------------------------------------------------------

export interface IPlugin {
    name: string;
    init?(context?: any): Promise<void>;
    start?(context?: any): Promise<void>;
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

interface HiveConfig {
    discord: any;
    telegram: any;
    reddit: any;
    twitter: any;
    farcaster: any;
    email: any;
}

class HiveSwarm {
    private config: HiveConfig;
    private adapters: Map<string, any> = new Map();

    constructor() {
        // Load configuration
        const configPath = process.env.CONFIG_PATH || './configenv.json';
        this.config = JSON.parse(readFileSync(configPath, 'utf-8'));
    }

    async start() {
        try {
            Logger.info('Starting HiveAI Swarm...');

            // Initialize Discord adapter
            const discordAdapter = new DiscordAdapter(this.config.discord);
            this.adapters.set('discord', discordAdapter);

            // Initialize Telegram adapter
            const telegramAdapter = new TelegramAdapter(this.config.telegram);
            this.adapters.set('telegram', telegramAdapter);

            // Initialize Reddit adapter
            const redditAdapter = new RedditAdapter(this.config.reddit);
            this.adapters.set('reddit', redditAdapter);

            // Initialize Twitter adapter
            const twitterAdapter = new TwitterAdapter(this.config.twitter);
            this.adapters.set('twitter', twitterAdapter);

            // Initialize Farcaster adapter
            const farcasterAdapter = new FarcasterAdapter(this.config.farcaster);
            this.adapters.set('farcaster', farcasterAdapter);

            // Initialize Email adapter
            const emailAdapter = new EmailAdapter(this.config.email);
            this.adapters.set('email', emailAdapter);

            // Start all adapters
            await Promise.all([...this.adapters.values()].map(adapter => adapter.start()));

            Logger.success('HiveAI Swarm started successfully!');

            // Handle shutdown
            this.setupShutdownHandlers();

        } catch (error) {
            Logger.error('Failed to start HiveAI Swarm:', error);
            process.exit(1);
        }
    }

    private setupShutdownHandlers() {
        const shutdown = async () => {
            Logger.info('Shutting down HiveAI Swarm...');
            
            // Stop all adapters
            await Promise.all([...this.adapters.values()].map(adapter => adapter.stop()));
            
            Logger.success('HiveAI Swarm shutdown complete');
            process.exit(0);
        };

        // Handle graceful shutdown
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        process.on('uncaughtException', (error) => {
            Logger.error('Uncaught exception:', error);
            shutdown();
        });
    }
}

// ----------------------------------------------------------------------------
// Start the AI Swarm and set up process-level error handlers
// ----------------------------------------------------------------------------

const hiveSwarm = new HiveSwarm();
hiveSwarm.start();

// Optionally prevent unhandled exceptions from crashing the process
if (process.env.PREVENT_UNHANDLED_EXIT === "true") {
    process.on("uncaughtException", (err) => {
        Logger.error("uncaughtException", err);
    });
    process.on("unhandledRejection", (err) => {
        Logger.error("unhandledRejection", err);
    });
}