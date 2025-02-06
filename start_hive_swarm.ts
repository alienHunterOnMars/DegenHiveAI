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

import { AgentOrchestrator } from "./services/agentOrchestrator";
import { TelegramAdapter } from "@hiveai/adapters-telegram";
import { DiscordAdapter } from "@hiveai/adapters-discord";
import { TradeExecutionService } from "./services/tradeExecutionService";
import { DragonbeeModule } from "./modules/dragonbeeModule";
import { EventBus } from "./infrastructure/eventBus";
import { Logger } from "./utils/logger";

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

async function startHiveSwarm() {
    try {
        Logger.info("Starting DegenHive AI Swarm...");

        // Initialize core infrastructure
        const eventBus = new EventBus();

        // Set up the Plugin Manager to load additional capabilities
        const pluginManager = new PluginManager();
        await pluginManager.loadPlugins();

        // Shared context passed on to plugins; plugins can access core services or modify config
        const sharedContext = {
            eventBus,
            config: process.env,
        };

        // Initialize all loaded plugins (e.g., extra message adapters, extended logging, or AI enhancements).
        await pluginManager.initializePlugins(sharedContext);

        // Initialize communication adapters using basic configuration.
        // Plugins may contribute alternative implementations or augment these instances.
        const telegramAdapter = new TelegramAdapter({
            token: process.env.TELEGRAM_BOT_TOKEN || "",
            founderChatId: process.env.TELEGRAM_FOUNDER_CHAT_ID || "",
            groupChatId: process.env.TELEGRAM_GROUP_CHAT_ID || "",
        });

        const discordAdapter = new DiscordAdapter({
            token: process.env.DISCORD_BOT_TOKEN || "",
            guildId: process.env.DISCORD_GUILD_ID || "",
            announcementChannelId: process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID || "",
        });

        // Instantiate core services
        const tradeExecutionService = new TradeExecutionService({
            // Pass any required configuration for trade execution, order monitoring, etc.
        });

        const dragonbeeModule = new DragonbeeModule({
            memoryStore: {}, // Can be extended later with persistent or RL-based memory
        });

        // Build main agent orchestrator that ties communication, trade service, and role-play modules together.
        const agentOrchestrator = new AgentOrchestrator({
            eventBus,
            tradeService: tradeExecutionService,
            telegramAdapter,
            discordAdapter,
            dragonbeeModule,
        });

        // Register incoming message listeners for Telegram and Discord.
        telegramAdapter.on("message", async (msg) => {
            try {
                await agentOrchestrator.handleTelegramMessage(msg);
            } catch (error) {
                Logger.error("Error processing Telegram message", error);
            }
        });

        discordAdapter.on("message", async (msg) => {
            try {
                await agentOrchestrator.handleDiscordMessage(msg);
            } catch (error) {
                Logger.error("Error processing Discord message", error);
            }
        });

        // Start additional plugins (for example, extra analytics, advanced adaptation layers, etc.)
        await pluginManager.startPlugins(sharedContext);

        // Start the communication adapters; they open the connections to respective platforms.
        await telegramAdapter.start();
        await discordAdapter.start();

        // Start the trade execution service
        tradeExecutionService.start();

        // Start the agent orchestrator to initialize agents and routing
        await agentOrchestrator.start();

        // If a direct client (for REST or socket endpoint) is used for further interaction,
        // you can attach helper methods (for instance, to dynamically create direct-chat agents)
        const directClient: any = {}; // Replace with your actual DirectClient instance if needed
        directClient.startAgent = async (character: any) => {
            // Plugins can further extend or enhance the starting sequence for an individual agent.
            return agentOrchestrator.startAgent(character, directClient);
        };

        // Find an available port dynamically (if a server component is required).
        let serverPort = Number.parseInt(process.env.SERVER_PORT || "3000");
        while (!(await checkPortAvailable(serverPort))) {
            Logger.warn(`Port ${serverPort} is in use, trying ${serverPort + 1}`);
            serverPort++;
        }
        // If you implement a DirectClient server or API layer, start it here.
        // For example: await directClient.start(serverPort);

        Logger.info(`DegenHive AI Swarm started successfully on port ${serverPort}!`);
    } catch (error) {
        Logger.error("Unhandled error starting DegenHive AI Swarm:", error);
        process.exit(1);
    }
}

/**
 * Utility function to check if a TCP port is available.
 * Returns true if available, false if in use.
 */
const checkPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
        const net = require("net");
        const server = net.createServer();

        server.once("error", (err: any) => {
            if (err.code === "EADDRINUSE") {
                resolve(false);
            } else {
                resolve(false);
            }
        });

        server.once("listening", () => {
            server.close();
            resolve(true);
        });

        server.listen(port);
    });
};

// ----------------------------------------------------------------------------
// Start the AI Swarm and set up process-level error handlers
// ----------------------------------------------------------------------------

startHiveSwarm().catch((error) => {
    Logger.error("Unhandled error in startHiveSwarm:", error);
    process.exit(1);
});

// Optionally prevent unhandled exceptions from crashing the process
if (process.env.PREVENT_UNHANDLED_EXIT === "true") {
    process.on("uncaughtException", (err) => {
        Logger.error("uncaughtException", err);
    });
    process.on("unhandledRejection", (err) => {
        Logger.error("unhandledRejection", err);
    });
}