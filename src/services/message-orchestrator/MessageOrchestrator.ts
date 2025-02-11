import { Logger } from '@hiveai/utils';
import { KafkaEventBus } from '../../infrastructure/KafkaEventBus';
import { ServiceRegistry } from '../../infrastructure/ServiceRegistry';
import { RedisClient } from '../../infrastructure/RedisClient';
import { AgentOrchestrator } from '../agent-orchestrator/AgentOrchestrator';
import { Plugin } from '@hiveai/utils';
import { solanaPlugin } from '@hiveai/solana-plugin';
import { suiPlugin } from '@hiveai/sui-plugin';
import { hyperliquidPlugin } from '@hiveai/hyperliquid-plugin';

interface Message {
    platform: 'telegram' | 'discord' | 'reddit' | 'farcaster';
    type: 'CHAT' | 'TRADE' | 'COMMAND';
    userId: string;
    content: string;
    metadata: Record<string, any>;
}

export class MessageOrchestrator {
    private plugins: Map<string, Plugin>;
    private activeAgents: Set<string>;

    constructor(
        private eventBus: KafkaEventBus,
        private registry: ServiceRegistry,
        private redis: RedisClient,
        private agentOrchestrator: AgentOrchestrator
    ) {
        this.plugins = new Map();
        this.activeAgents = new Set();
        this.initializePlugins();
    }

    private initializePlugins(): void {
        // Initialize blockchain plugins
        this.plugins.set('solana', solanaPlugin);
        this.plugins.set('sui', suiPlugin);
        this.plugins.set('hyperliquid', hyperliquidPlugin);
    }

    async start(): Promise<void> {
        try {
            // Subscribe to messages from all social adapters
            await this.subscribeToAdapters();
            Logger.info('MessageOrchestrator: Started successfully');
        } catch (error) {
            Logger.error('MessageOrchestrator: Failed to start:', error);
            throw error;
        }
    }

    private async subscribeToAdapters(): Promise<void> {
        // Subscribe to all social platform messages
        await this.eventBus.subscribe(
            'social.messages',
            'message-orchestrator',
            this.handleSocialMessage.bind(this)
        );

        // Subscribe to trade responses
        await this.eventBus.subscribe(
            'trade.responses',
            'message-orchestrator',
            this.handleTradeResponse.bind(this)
        );
    }

    private async handleSocialMessage(message: Message): Promise<void> {
        try {
            // Check if user has an active agent
            const hasAgent = await this.redis.exists(`agent:${message.userId}`);
            
            if (!hasAgent) {
                // Create new DragonBee agent for user
                await this.agentOrchestrator.handleCommand({
                    command: 'CREATE_AGENT',
                    userId: message.userId
                });
            }

            // Process message based on type
            switch (message.type) {
                case 'TRADE':
                    await this.handleTradeMessage(message);
                    break;
                case 'CHAT':
                    await this.handleChatMessage(message);
                    break;
                case 'COMMAND':
                    await this.handleCommandMessage(message);
                    break;
            }
        } catch (error) {
            Logger.error('MessageOrchestrator: Error handling message:', error);
            // Send error response back to user
            await this.sendErrorResponse(message, error);
        }
    }

    private async handleTradeMessage(message: Message): Promise<void> {
        try {
            // Parse trade intent from message
            const tradeIntent = await this.parseTradeIntent(message.content);
            
            // Route to appropriate blockchain plugin
            const plugin = this.plugins.get(tradeIntent.chain);
            if (!plugin) {
                throw new Error(`Unsupported chain: ${tradeIntent.chain}`);
            }

            // Execute trade action
            await this.eventBus.publish('trade.requests', {
                userId: message.userId,
                platform: message.platform,
                tradeIntent,
                timestamp: Date.now()
            });

        } catch (error) {
            Logger.error('MessageOrchestrator: Trade handling error:', error);
            await this.sendErrorResponse(message, error);
        }
    }

    private async handleChatMessage(message: Message): Promise<void> {
        try {
            // Route message to agent orchestrator for AI processing
            await this.eventBus.publish('agent.interactions', {
                userId: message.userId,
                platform: message.platform,
                content: message.content,
                timestamp: Date.now()
            });
        } catch (error) {
            Logger.error('MessageOrchestrator: Chat handling error:', error);
            await this.sendErrorResponse(message, error);
        }
    }

    private async handleCommandMessage(message: Message): Promise<void> {
        try {
            // Parse and route command to appropriate handler
            const command = await this.parseCommand(message.content);
            
            await this.eventBus.publish('agent.commands', {
                command: command.type,
                userId: message.userId,
                platform: message.platform,
                params: command.params,
                timestamp: Date.now()
            });
        } catch (error) {
            Logger.error('MessageOrchestrator: Command handling error:', error);
            await this.sendErrorResponse(message, error);
        }
    }

    private async handleTradeResponse(response: any): Promise<void> {
        try {
            // Route trade response back to user through appropriate platform
            await this.eventBus.publish(`${response.platform}.responses`, {
                userId: response.userId,
                content: this.formatTradeResponse(response),
                timestamp: Date.now()
            });
        } catch (error) {
            Logger.error('MessageOrchestrator: Trade response handling error:', error);
        }
    }

    private async parseTradeIntent(content: string): Promise<any> {
        // Implement trade intent parsing logic
        // This would extract trading parameters from user message
        return {
            chain: 'solana',
            type: 'TRADE',
            // ... other trade parameters
        };
    }

    private async parseCommand(content: string): Promise<any> {
        // Implement command parsing logic
        return {
            type: 'COMMAND_TYPE',
            params: {}
        };
    }

    private formatTradeResponse(response: any): string {
        // Format trade response for user
        return `Trade ${response.status}: ${response.details}`;
    }

    private async sendErrorResponse(message: Message, error: Error): Promise<void> {
        await this.eventBus.publish(`${message.platform}.responses`, {
            userId: message.userId,
            content: `Error: ${error.message}`,
            timestamp: Date.now()
        });
    }
} 