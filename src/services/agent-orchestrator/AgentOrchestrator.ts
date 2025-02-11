// import { Logger } from '@hiveai/utils';
// import { KafkaEventBus } from '../../infrastructure/KafkaEventBus';
// import { ServiceRegistry } from '../../infrastructure/ServiceRegistry';
// import { RedisClient } from '../../infrastructure/RedisClient';
// import { DragonBeeAgent } from './DragonBeeAgent';

// interface AgentState {
//     userId: string;
//     agentId: string;
//     status: 'active' | 'idle' | 'busy' | 'error';
//     type: 'dragonbee' | 'master' | 'trading';
//     lastInteraction: number;
//     metadata: {
//         personality?: string;
//         tradingPairs?: string[];
//         activeOrders?: number;
//         performanceMetrics?: {
//             successfulTrades: number;
//             failedTrades: number;
//             profitLoss: number;
//         };
//         userPreferences?: Record<string, any>;
//     };
// }

// interface AgentShard {
//     id: string;
//     capacity: number;
//     currentLoad: number;
//     agents: Set<string>;
// }

// export class AgentOrchestrator {
//     private agents: Map<string, DragonBeeAgent>;
//     private shards: Map<string, AgentShard>;
//     private readonly maxAgentsPerShard: number;
//     private shardId: string;
//     private healthCheckInterval: NodeJS.Timer | null = null;

//     constructor(
//         private eventBus: KafkaEventBus,
//         private registry: ServiceRegistry,
//         private redis: RedisClient,
//         shardId: string,
//         maxAgentsPerShard: number = 1000
//     ) {
//         this.agents = new Map();
//         this.shards = new Map();
//         this.shardId = shardId;
//         this.maxAgentsPerShard = maxAgentsPerShard;
//     }

//     async start(): Promise<void> {
//         try {
//             // Initialize shard
//             await this.initializeShard();

//             // Restore agent states from Redis
//             await this.restoreAgentStates();

//             // Subscribe to agent-related events
//             await this.subscribeToEvents();
            
//             // Start monitoring and maintenance tasks
//             this.startMaintenanceTasks();
            
//             Logger.info(`AgentOrchestrator shard ${this.shardId} started with ${this.agents.size} agents`);
//         } catch (error) {
//             Logger.error('AgentOrchestrator: Failed to start:', error);
//             throw error;
//         }
//     }

//     private async initializeShard(): Promise<void> {
//         const shard: AgentShard = {
//             id: this.shardId,
//             capacity: this.maxAgentsPerShard,
//             currentLoad: 0,
//             agents: new Set()
//         };

//         this.shards.set(this.shardId, shard);

//         await this.registry.register({
//             id: this.shardId,
//             name: 'agent-orchestrator',
//             host: process.env.HOST || 'localhost',
//             port: parseInt(process.env.PORT || '3000'),
//             status: 'healthy',
//             metadata: {
//                 agentCount: 0,
//                 maxAgents: this.maxAgentsPerShard,
//                 load: 0
//             }
//         });
//     }

//     private async restoreAgentStates(): Promise<void> {
//         const agentKeys = await this.redis.keys('agent:*');
        
//         for (const key of agentKeys) {
//             try {
//                 const state = await this.redis.hGetAll(key);
//                 if (state && state.agentId) {
//                     await this.restoreAgent(state as unknown as AgentState);
//                 }
//             } catch (error) {
//                 Logger.error(`Failed to restore agent state for ${key}:`, error);
//             }
//         }
//     }

//     private async restoreAgent(state: AgentState): Promise<void> {
//         try {
//             const agent = new DragonBeeAgent(
//                 state.agentId,
//                 state.userId,
//                 this.eventBus,
//                 state.metadata
//             );

//             await agent.initialize();
//             this.agents.set(state.agentId, agent);
            
//             const shard = this.shards.get(this.shardId);
//             if (shard) {
//                 shard.agents.add(state.agentId);
//                 shard.currentLoad++;
//             }
//         } catch (error) {
//             Logger.error(`Failed to restore agent ${state.agentId}:`, error);
//         }
//     }

//     private async subscribeToEvents(): Promise<void> {
//         await this.eventBus.subscribe(
//             'agent.commands',
//             `agent-orchestrator-${this.shardId}`,
//             this.handleCommand.bind(this)
//         );

//         await this.eventBus.subscribe(
//             'agent.interactions',
//             `agent-orchestrator-${this.shardId}`,
//             this.handleInteraction.bind(this)
//         );

//         await this.eventBus.subscribe(
//             'trade.results',
//             `agent-orchestrator-${this.shardId}`,
//             this.handleTradeResult.bind(this)
//         );
//     }

//     private startMaintenanceTasks(): void {
//         // Periodic health checks and maintenance
//         this.healthCheckInterval = setInterval(async () => {
//             await this.performHealthChecks();
//             await this.balanceShardLoad();
//             await this.updateMetrics();
//         }, 30000); // Every 30 seconds

//         // Periodic state persistence
//         setInterval(async () => {
//             await this.persistAgentStates();
//         }, 60000); // Every minute
//     }

//     private async handleCommand(message: any): Promise<void> {
//         try {
//             switch (message.command) {
//                 case 'CREATE_AGENT':
//                     await this.createAgent(message.userId, message.type, message.metadata);
//                     break;
//                 case 'TERMINATE_AGENT':
//                     await this.terminateAgent(message.agentId);
//                     break;
//                 case 'UPDATE_AGENT':
//                     await this.updateAgent(message.agentId, message.updates);
//                     break;
//                 default:
//                     Logger.warn(`Unknown command: ${message.command}`);
//             }
//         } catch (error) {
//             Logger.error('AgentOrchestrator: Command handling error:', error);
//             await this.eventBus.publish('agent.errors', {
//                 error: error.message,
//                 command: message.command,
//                 agentId: message.agentId
//             });
//         }
//     }

//     private async handleInteraction(message: any): Promise<void> {
//         try {
//             const agent = this.agents.get(message.agentId);
//             if (!agent) {
//                 throw new Error(`Agent ${message.agentId} not found`);
//             }

//             await agent.handleInteraction(message);
//         } catch (error) {
//             Logger.error('AgentOrchestrator: Interaction handling error:', error);
//         }
//     }

//     private async handleTradeResult(message: any): Promise<void> {
//         try {
//             const agent = this.agents.get(message.agentId);
//             if (!agent) return;

//             await agent.handleTradeResult(message);
//             await this.updateAgentMetrics(agent, message);
//         } catch (error) {
//             Logger.error('AgentOrchestrator: Trade result handling error:', error);
//         }
//     }

//     private async createAgent(
//         userId: string,
//         type: AgentState['type'],
//         metadata: AgentState['metadata']
//     ): Promise<string> {
//         const shard = this.shards.get(this.shardId);
//         if (!shard || shard.currentLoad >= shard.capacity) {
//             throw new Error('Shard capacity reached');
//         }

//         const agentId = `agent-${type}-${userId}-${Date.now()}`;
//         const agent = new DragonBeeAgent(agentId, userId, this.eventBus, metadata);
        
//         await agent.initialize();
//         this.agents.set(agentId, agent);
        
//         shard.agents.add(agentId);
//         shard.currentLoad++;

//         await this.persistAgentState(agent);
//         return agentId;
//     }

//     private async terminateAgent(agentId: string): Promise<void> {
//         const agent = this.agents.get(agentId);
//         if (!agent) return;

//         await agent.cleanup();
//         this.agents.delete(agentId);
        
//         const shard = this.shards.get(this.shardId);
//         if (shard) {
//             shard.agents.delete(agentId);
//             shard.currentLoad--;
//         }

//         await this.redis.del(`agent:${agentId}`);
//     }

//     private async persistAgentStates(): Promise<void> {
//         const pipeline = this.redis.pipeline();
        
//         for (const agent of this.agents.values()) {
//             const state = await agent.getState();
//             pipeline.hSet(`agent:${agent.getId()}`, state);
//         }

//         await pipeline.exec();
//     }

//     private async performHealthChecks(): Promise<void> {
//         for (const [agentId, agent] of this.agents.entries()) {
//             try {
//                 const isHealthy = await agent.healthCheck();
//                 if (!isHealthy) {
//                     Logger.warn(`Agent ${agentId} failed health check, attempting recovery`);
//                     await this.recoverAgent(agent);
//                 }
//             } catch (error) {
//                 Logger.error(`Health check failed for agent ${agentId}:`, error);
//             }
//         }
//     }

//     private async recoverAgent(agent: DragonBeeAgent): Promise<void> {
//         try {
//             await agent.cleanup();
//             await agent.initialize();
//         } catch (error) {
//             Logger.error(`Failed to recover agent ${agent.getId()}:`, error);
//             await this.terminateAgent(agent.getId());
//         }
//     }

//     private async balanceShardLoad(): Promise<void> {
//         // Implement shard load balancing logic
//     }

//     private async updateMetrics(): Promise<void> {
//         const shard = this.shards.get(this.shardId);
//         if (!shard) return;

//         await this.registry.register({
//             id: this.shardId,
//             name: 'agent-orchestrator',
//             host: process.env.HOST || 'localhost',
//             port: parseInt(process.env.PORT || '3000'),
//             status: 'healthy',
//             metadata: {
//                 agentCount: this.agents.size,
//                 maxAgents: this.maxAgentsPerShard,
//                 load: shard.currentLoad / shard.capacity
//             }
//         });
//     }

//     async stop(): Promise<void> {
//         if (this.healthCheckInterval) {
//             clearInterval(this.healthCheckInterval);
//         }

//         // Cleanup all agents
//         const cleanupPromises = Array.from(this.agents.values()).map(agent => agent.cleanup());
//         await Promise.all(cleanupPromises);

//         // Persist final states
//         await this.persistAgentStates();

//         this.agents.clear();
//         this.shards.clear();
//     }
// } 