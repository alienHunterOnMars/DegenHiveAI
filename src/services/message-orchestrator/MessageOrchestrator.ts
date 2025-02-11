// import { Logger } from '@hiveai/utils';
// import { KafkaEventBus } from '../../infrastructure/KafkaEventBus';
// import { ServiceRegistry } from '../../infrastructure/ServiceRegistry';
// import { RedisClient } from '../../infrastructure/RedisClient';
// import { AgentOrchestrator } from '../agent-orchestrator/AgentOrchestrator';
// import { Plugin } from '@hiveai/utils';

// interface Message {
//     id: string;
//     platform: 'telegram' | 'discord' | 'reddit' | 'farcaster' | 'twitter' | 'email';
//     type: 'CHAT' | 'TRADE' | 'COMMAND' | 'NOTIFICATION';
//     userId: string;
//     content: string;
//     metadata: {
//         channelId?: string;
//         threadId?: string;
//         replyTo?: string;
//         mentions?: string[];
//         attachments?: any[];
//         timestamp: number;
//         context?: Record<string, any>;
//     };
// }

// interface MessageRoutingRule {
//     platform: Message['platform'];
//     type: Message['type'];
//     priority: number;
//     handler: (message: Message) => Promise<void>;
// }

// export class MessageOrchestrator {
//     private plugins: Map<string, Plugin>;
//     private routingRules: MessageRoutingRule[];
//     private messageCache: Map<string, Message>;
//     private readonly maxCacheSize = 10000;
//     private processingQueues: Map<string, Message[]>;
//     private isProcessing: boolean = false;

//     constructor(
//         private eventBus: KafkaEventBus,
//         private registry: ServiceRegistry,
//         private redis: RedisClient,
//         private agentOrchestrator: AgentOrchestrator
//     ) {
//         this.plugins = new Map();
//         this.routingRules = [];
//         this.messageCache = new Map();
//         this.processingQueues = new Map();
//         this.initializePlugins();
//         this.setupRoutingRules();
//     }

//     private initializePlugins(): void {
//         // Initialize blockchain plugins
//         const plugins = [
//             require('@hiveai/solana-plugin').default,
//             require('@hiveai/sui-plugin').default,
//             require('@hiveai/hyperliquid-plugin').default
//         ];

//         plugins.forEach(plugin => {
//             this.plugins.set(plugin.name, plugin);
//         });
//     }

//     private setupRoutingRules(): void {
//         // Setup message routing rules with priorities
//         this.routingRules = [
//             {
//                 platform: 'telegram',
//                 type: 'TRADE',
//                 priority: 1,
//                 handler: this.handleTradeMessage.bind(this)
//             },
//             {
//                 platform: 'discord',
//                 type: 'COMMAND',
//                 priority: 2,
//                 handler: this.handleCommandMessage.bind(this)
//             },
//             // Add more routing rules...
//         ];

//         // Sort rules by priority
//         this.routingRules.sort((a, b) => a.priority - b.priority);
//     }

//     async start(): Promise<void> {
//         try {
//             // Subscribe to messages from all social adapters
//             await this.subscribeToAdapters();
            
//             // Start message processing loop
//             this.startMessageProcessing();
            
//             Logger.info('MessageOrchestrator: Started successfully');
//         } catch (error) {
//             Logger.error('MessageOrchestrator: Failed to start:', error);
//             throw error;
//         }
//     }

//     private async subscribeToAdapters(): Promise<void> {
//         // Subscribe to all social platform messages
//         const platforms: Message['platform'][] = [
//             'telegram', 'discord', 'reddit', 'farcaster', 'twitter', 'email'
//         ];

//         for (const platform of platforms) {
//             await this.eventBus.subscribe(
//                 `${platform}.messages`,
//                 'message-orchestrator',
//                 this.handleIncomingMessage.bind(this),
//                 { autoCommit: false }
//             );

//             // Initialize processing queue for platform
//             this.processingQueues.set(platform, []);
//         }
//     }

//     private async handleIncomingMessage(message: Message): Promise<void> {
//         try {
//             // Add message to cache with TTL
//             this.cacheMessage(message);

//             // Add to processing queue
//             const queue = this.processingQueues.get(message.platform);
//             if (queue) {
//                 queue.push(message);
//             }

//             // Trigger processing if not already running
//             if (!this.isProcessing) {
//                 this.processMessageQueues();
//             }
//         } catch (error) {
//             Logger.error('MessageOrchestrator: Error handling incoming message:', error);
//         }
//     }

//     private async processMessageQueues(): Promise<void> {
//         if (this.isProcessing) return;
//         this.isProcessing = true;

//         try {
//             while (this.hasMessagesToProcess()) {
//                 for (const [platform, queue] of this.processingQueues.entries()) {
//                     if (queue.length === 0) continue;

//                     // Process message with rate limiting
//                     const message = queue.shift()!;
//                     await this.processMessage(message);

//                     // Apply rate limiting
//                     await this.applyRateLimit(platform);
//                 }
//             }
//         } catch (error) {
//             Logger.error('MessageOrchestrator: Queue processing error:', error);
//         } finally {
//             this.isProcessing = false;
//         }
//     }

//     private async processMessage(message: Message): Promise<void> {
//         try {
//             // Find matching routing rule
//             const rule = this.findRoutingRule(message);
//             if (!rule) {
//                 Logger.warn(`No routing rule found for message type ${message.type} on ${message.platform}`);
//                 return;
//             }

//             // Handle message based on rule
//             await rule.handler(message);

//         } catch (error) {
//             Logger.error('MessageOrchestrator: Message processing error:', error);
//             await this.handleProcessingError(message, error);
//         }
//     }

//     private findRoutingRule(message: Message): MessageRoutingRule | undefined {
//         return this.routingRules.find(rule => 
//             rule.platform === message.platform && 
//             rule.type === message.type
//         );
//     }

//     private async handleTradeMessage(message: Message): Promise<void> {
//         try {
//             // Parse trade intent
//             const tradeIntent = await this.parseTradeIntent(message.content);
            
//             // Validate trade parameters
//             await this.validateTradeIntent(tradeIntent);

//             // Route to appropriate blockchain plugin
//             const plugin = this.plugins.get(tradeIntent.chain);
//             if (!plugin) {
//                 throw new Error(`Unsupported chain: ${tradeIntent.chain}`);
//             }

//             // Submit trade request
//             await this.eventBus.publish('trade.requests', {
//                 messageId: message.id,
//                 userId: message.userId,
//                 platform: message.platform,
//                 tradeIntent,
//                 timestamp: Date.now()
//             });

//         } catch (error) {
//             Logger.error('MessageOrchestrator: Trade handling error:', error);
//             await this.sendErrorResponse(message, error);
//         }
//     }

//     private async handleCommandMessage(message: Message): Promise<void> {
//         try {
//             // Parse command
//             const command = await this.parseCommand(message.content);
            
//             // Route command to agent orchestrator
//             await this.eventBus.publish('agent.commands', {
//                 messageId: message.id,
//                 command: command.type,
//                 userId: message.userId,
//                 platform: message.platform,
//                 params: command.params,
//                 timestamp: Date.now()
//             });

//         } catch (error) {
//             Logger.error('MessageOrchestrator: Command handling error:', error);
//             await this.sendErrorResponse(message, error);
//         }
//     }

//     private async parseTradeIntent(content: string): Promise<any> {
//         // Implement trade intent parsing logic
//         // This would extract trading parameters from user message
//         return {
//             chain: 'solana',
//             type: 'TRADE',
//             // ... other trade parameters
//         };
//     }

//     private async validateTradeIntent(tradeIntent: any): Promise<void> {
//         // Implement trade validation logic
//     }

//     private async parseCommand(content: string): Promise<any> {
//         // Implement command parsing logic
//         return {
//             type: 'COMMAND_TYPE',
//             params: {}
//         };
//     }

//     private async sendErrorResponse(message: Message, error: Error): Promise<void> {
//         await this.eventBus.publish(`${message.platform}.responses`, {
//             messageId: message.id,
//             userId: message.userId,
//             content: `Error: ${error.message}`,
//             timestamp: Date.now()
//         });
//     }

//     private cacheMessage(message: Message): void {
//         // Implement LRU cache with max size
//         if (this.messageCache.size >= this.maxCacheSize) {
//             const oldestKey = this.messageCache.keys().next().value;
//             this.messageCache.delete(oldestKey);
//         }
//         this.messageCache.set(message.id, message);
//     }

//     private hasMessagesToProcess(): boolean {
//         return Array.from(this.processingQueues.values())
//             .some(queue => queue.length > 0);
//     }

//     private async applyRateLimit(platform: Message['platform']): Promise<void> {
//         // Implement platform-specific rate limiting
//         const delays: Record<Message['platform'], number> = {
//             telegram: 50,  // 20 messages per second
//             discord: 50,   // 20 messages per second
//             reddit: 1000,  // 1 message per second
//             farcaster: 1000,
//             twitter: 1000,
//             email: 1000
//         };

//         await new Promise(resolve => setTimeout(resolve, delays[platform]));
//     }

//     async stop(): Promise<void> {
//         this.isProcessing = false;
//         this.messageCache.clear();
//         this.processingQueues.clear();
//         Logger.info('MessageOrchestrator: Stopped');
//     }
// } 