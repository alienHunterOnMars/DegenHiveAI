import { Logger } from '@hiveai/utils';
import { KafkaEventBus } from '../../infrastructure/KafkaEventBus';
import { ServiceRegistry } from '../../infrastructure/ServiceRegistry';
import { RedisClient } from '../../infrastructure/RedisClient';

interface AgentState {
    userId: string;
    agentId: string;
    status: 'active' | 'idle' | 'busy';
    lastInteraction: number;
    metadata: Record<string, any>;
}

export class AgentOrchestrator {
    private agents: Map<string, AgentState>;
    private readonly maxAgentsPerShard = 1000;
    private shardId: string;

    constructor(
        private eventBus: KafkaEventBus,
        private registry: ServiceRegistry,
        private redis: RedisClient,
        shardId: string
    ) {
        this.agents = new Map();
        this.shardId = shardId;
    }

    async start(): Promise<void> {
        try {
            // Register this shard
            await this.registry.register({
                id: this.shardId,
                name: 'agent-orchestrator',
                host: process.env.HOST || 'localhost',
                port: parseInt(process.env.PORT || '3000'),
                status: 'healthy',
                metadata: {
                    agentCount: 0,
                    maxAgents: this.maxAgentsPerShard
                }
            });

            // Subscribe to agent-related events
            await this.subscribeToEvents();
            
            // Start periodic state sync
            this.startStateSync();
            
            Logger.info(`AgentOrchestrator shard ${this.shardId} started`);
        } catch (error) {
            Logger.error('AgentOrchestrator: Failed to start:', error);
            throw error;
        }
    }

    private async subscribeToEvents(): Promise<void> {
        await this.eventBus.subscribe(
            'agent.commands',
            `agent-orchestrator-${this.shardId}`,
            this.handleCommand.bind(this)
        );

        await this.eventBus.subscribe(
            'agent.interactions',
            `agent-orchestrator-${this.shardId}`,
            this.handleInteraction.bind(this)
        );
    }

    private async handleCommand(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'CREATE_AGENT':
                    await this.createAgent(message.userId);
                    break;
                case 'TERMINATE_AGENT':
                    await this.terminateAgent(message.agentId);
                    break;
                // Add more command handlers
            }
        } catch (error) {
            Logger.error('AgentOrchestrator: Command handling error:', error);
        }
    }

    private async handleInteraction(message: any): Promise<void> {
        try {
            const agent = this.agents.get(message.agentId);
            if (!agent) return;

            // Update agent state
            agent.lastInteraction = Date.now();
            agent.status = 'busy';

            // Process interaction
            await this.processInteraction(agent, message);

            // Update agent state after processing
            agent.status = 'idle';
            await this.updateAgentState(agent);
        } catch (error) {
            Logger.error('AgentOrchestrator: Interaction handling error:', error);
        }
    }

    private async processInteraction(agent: AgentState, message: any): Promise<void> {
        // Implement interaction processing logic
        // This could involve AI model calls, trade processing, etc.
    }

    private async createAgent(userId: string): Promise<void> {
        if (this.agents.size >= this.maxAgentsPerShard) {
            throw new Error('Shard capacity reached');
        }

        const agentId = `agent-${userId}-${Date.now()}`;
        const agent: AgentState = {
            userId,
            agentId,
            status: 'idle',
            lastInteraction: Date.now(),
            metadata: {}
        };

        this.agents.set(agentId, agent);
        await this.updateAgentState(agent);
    }

    private async updateAgentState(agent: AgentState): Promise<void> {
        await this.redis.hSet(
            `agent:${agent.agentId}`,
            agent
        );
    }

    private startStateSync(): void {
        setInterval(async () => {
            try {
                // Sync agent states to Redis
                for (const agent of this.agents.values()) {
                    await this.updateAgentState(agent);
                }

                // Update service registry metadata
                await this.registry.register({
                    id: this.shardId,
                    name: 'agent-orchestrator',
                    host: process.env.HOST || 'localhost',
                    port: parseInt(process.env.PORT || '3000'),
                    status: 'healthy',
                    metadata: {
                        agentCount: this.agents.size,
                        maxAgents: this.maxAgentsPerShard
                    }
                });
            } catch (error) {
                Logger.error('AgentOrchestrator: State sync error:', error);
            }
        }, 30000); // Every 30 seconds
    }
} 