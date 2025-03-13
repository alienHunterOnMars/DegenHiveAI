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

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as fs from 'node:fs';
import { fork, type ChildProcess } from 'child_process';
import * as dotenv from 'dotenv';
import { Logger } from '@hiveai/utils';
// Initialize dotenv with explicit path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env');

if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

// Now we can use Logger after it's imported
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

class ProcessManager {
    private processes: Map<string, ChildProcess> = new Map();

    async startProcess(name: string, scriptPath: string, env: any = {}): Promise<void> {
        try {
            
            const process: any = fork(scriptPath, [], {
                env: env,
                stdio: ['inherit', 'inherit', 'inherit', 'ipc']
            });

            // Create a promise that resolves when the process is ready
            const readyPromise = new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Process ${name} failed to initialize within 30 seconds`));
                }, 30000);

                process.on('message', (message: any) => {
                    if (message.type === 'ready') {
                        clearTimeout(timeout);
                        Logger.info(`Process ${name} initialized successfully`);
                        resolve();
                    }
                    Logger.info(`Message from ${name}:`, message);
                });

                process.on('error', (error: any) => {
                    clearTimeout(timeout);
                    Logger.error(`Process ${name} error:`, error);
                    reject(error);
                });

                process.on('exit', (code: any) => {
                    if (code !== 0) {
                        clearTimeout(timeout);
                        const error = new Error(`Process ${name} exited with code ${code}`);
                        Logger.error(error.message);
                        reject(error);
                    }
                });
            });

            this.processes.set(name, process);
            Logger.info(`Started process: ${name}`);

            // Wait for the process to be ready
            await readyPromise;
        } catch (error) {
            Logger.error(`Failed to start process ${name}:`, error);
            throw error;
        }
    }

    private async restartProcess(name: string, scriptPath: string, env: any): Promise<void> {
        Logger.info(`Attempting to restart process: ${name}`);
        await this.startProcess(name, scriptPath, env);
    }

    async stopAll(): Promise<void> {
        for (const [name, process] of this.processes) {
            process.kill();
            Logger.info(`Stopped process: ${name}`);
        }
    }
}

// ----------------------------------------------------------------------------
// Core Startup Logic
// ----------------------------------------------------------------------------

class HiveSwarm {

    private config: any;
    private processManager: ProcessManager;
    private isShuttingDown: boolean = false;

    // private plugins: Map<string, IPlugin>;
    // private eventBus: KafkaEventBus;
    // private redis: RedisClient;
    // private registry: ServiceRegistry;
    // private agentOrchestrator: AgentOrchestrator;
    // private messageOrchestrator: MessageOrchestrator;

    
    constructor() {
        this.processManager = new ProcessManager();
        this.config = {};
        try {
            const configPath = process.env.CONFIG_PATH || './env.json';
            this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (error) {
            Logger.error('Error loading config:', error);
            return;
        }

        // Logger.info('Config loaded:');
        // Logger.info(this.config);

        // this.plugins = new Map();
    }

    async start() {
        try {
            Logger.info('Starting HiveAI Swarm...');

            // Start Telegram process
            await this.processManager.startProcess('telegram', './dist/processes/telegram.js', {
                TELEGRAM_BOT_TOKEN: this.config.telegram?.token,
                TELEGRAM_GROUP_CHAT_ID: this.config.telegram?.communityChatId,
                TELEGRAM_FOUNDER_CHAT_ID: this.config.telegram?.founderChatId,
                REDIS_URL: this.config.redis_url
            });

            // Start email process
            // await this.processManager.startProcess('email', './dist/processes/email.js', {
            //     IMAP_HOST: this.config.email?.imap?.host,
            //     IMAP_PORT: this.config.email?.imap?.port,
            //     IMAP_USER: this.config.email?.imap?.auth?.user,
            //     IMAP_PASSWORD: this.config.email?.imap?.auth?.pass,
            //     IMAP_TLS: this.config.email?.imap?.tls,
            //     SENDGRID_API_KEY: this.config.email?.SENDGRID_API_KEY,
            //     SENDGRID_SIGNING_SECRET: this.config.email?.SENDGRID_SIGNING_SECRET,
            //     EMAIL_WEBHOOK_PORT: 3001, // Fixed port for webhook server
            //     REDIS_URL: this.config.redis_url
            // });

            // Start discord process
            await this.processManager.startProcess('discord', './dist/processes/discord.js', {
                DISCORD_TOKEN: this.config.discord?.token,
                DISCORD_GUILD_ID: this.config.discord?.guildId,
                DISCORD_ANNOUNCEMENT_CHANNEL_ID: this.config.discord?.announcementChannelId,
                DISCORD_ALPHA_CHANNEL_ID: this.config.discord?.alphaChannelId,
                DISCORD_MEME_CHANNEL_ID: this.config.discord?.memeChannelId,
                REDIS_URL: this.config.redis_url
            });

            // Start reddit process
            await this.processManager.startProcess('reddit', './dist/processes/reddit.js', {
                REDDIT_USER_AGENT: this.config.reddit?.userAgent,
                REDDIT_CLIENT_ID: this.config.reddit?.clientId,
                REDDIT_CLIENT_SECRET: this.config.reddit?.clientSecret,
                REDDIT_USERNAME: this.config.reddit?.username,
                REDDIT_PASSWORD: this.config.reddit?.password,
                REDDIT_REFRESH_TOKEN: this.config.reddit?.refreshToken,
                REDDIT_MONITORED_SUBREDDITS: this.config.reddit?.monitoredSubreddits?.join(','),
                REDDIT_AUTO_REPLY_ENABLED: this.config.reddit?.autoReplyEnabled ? 'true' : 'false',
                REDDIT_POST_APPROVAL_REQUIRED: this.config.reddit?.postApprovalRequired ? 'true' : 'false',
                REDIS_URL: this.config.redis_url
            });

            // // Start twitter process
            // await this.processManager.startProcess('twitter', './dist/processes/twitter.js', {
            //     TWITTER_API_KEY: this.config.twitter?.apiKey,
            //     TWITTER_API_SECRET: this.config.twitter?.apiSecret,
            //     TWITTER_ACCESS_TOKEN: this.config.twitter?.accessToken,
            //     TWITTER_ACCESS_SECRET: this.config.twitter?.accessTokenSecret,
            //     TWITTER_BEARER_TOKEN: this.config.twitter?.bearerToken,
            //     REDIS_URL: this.config.redis_url
            // });

            this.setupShutdownHandlers();

            Logger.success('HiveAI Swarm started successfully!');
        } catch (error) {
            Logger.error('Failed to start HiveAI Swarm:', error);
            await this.shutdown(1);
        }
    }
 

    private setupShutdownHandlers(): void {
        const shutdown = async (code: number = 0) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            Logger.info('Shutting down HiveAI Swarm...');
            await this.processManager.stopAll();
            Logger.success('HiveAI Swarm shutdown complete');
            process.exit(code);
        };
            
            process.on('SIGTERM', () => shutdown());
            process.on('SIGINT', () => shutdown());
            process.on('uncaughtException', (error) => {
                Logger.error('Uncaught exception:', error);
                shutdown(1);
            });
    }
    
  
    private async shutdown(code: number = 0): Promise<void> {
            if (this.isShuttingDown) {
                process.exit(code);
            }
            
            this.isShuttingDown = true;
            await this.processManager.stopAll();
            process.exit(code);
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