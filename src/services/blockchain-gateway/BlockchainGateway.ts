import { Logger } from '@hiveai/utils';
import { KafkaEventBus } from '../../infrastructure/KafkaEventBus';
import { ServiceRegistry } from '../../infrastructure/ServiceRegistry';
import { RedisClient } from '../../infrastructure/RedisClient';
import { ChainProvider } from './providers/ChainProvider';
import { SolanaProvider } from './providers/SolanaProvider';
import { SuiProvider } from './providers/SuiProvider';
import { HyperliquidProvider } from './providers/HyperliquidProvider';

interface TransactionRequest {
    chainId: string;
    type: 'TRADE' | 'TRANSFER' | 'SWAP';
    data: any;
}

interface TransactionResult {
    txHash: string;
    status: 'SUCCESS' | 'FAILED';
    error?: string;
    details?: any;
}

export class BlockchainGateway {
    private providers: Map<string, ChainProvider>;
    private pendingTransactions: Map<string, TransactionRequest>;
    private readonly maxConcurrentTx = 1000;
    private shardId: string;

    constructor(
        private eventBus: KafkaEventBus,
        private registry: ServiceRegistry,
        private redis: RedisClient,
        shardId: string
    ) {
        this.providers = new Map();
        this.pendingTransactions = new Map();
        this.shardId = shardId;
    }

    async start(): Promise<void> {
        try {
            // Initialize blockchain providers
            await this.initializeProviders();

            // Register service
            await this.registry.register({
                id: this.shardId,
                name: 'blockchain-gateway',
                host: process.env.HOST || 'localhost',
                port: parseInt(process.env.PORT || '3002'),
                status: 'healthy',
                metadata: {
                    pendingTx: 0,
                    maxTx: this.maxConcurrentTx
                }
            });

            // Subscribe to transaction events
            await this.subscribeToEvents();

            // Start transaction monitoring
            this.startTransactionMonitoring();

            Logger.info(`BlockchainGateway shard ${this.shardId} started`);
        } catch (error) {
            Logger.error('BlockchainGateway: Failed to start:', error);
            throw error;
        }
    }

    private async initializeProviders(): Promise<void> {
        // Initialize providers with configuration from environment/redis
        const config = await this.loadChainConfigs();

        this.providers.set('solana', new SolanaProvider(config.solana));
        this.providers.set('sui', new SuiProvider(config.sui));
        this.providers.set('hyperliquid', new HyperliquidProvider(config.hyperliquid));

        // Initialize connections
        await Promise.all(
            Array.from(this.providers.values()).map(provider => provider.initialize())
        );
    }

    private async loadChainConfigs(): Promise<any> {
        // Load configurations from Redis or environment variables
        const configs = await this.redis.hGetAll('chain:configs');
        return {
            solana: JSON.parse(configs.solana || '{}'),
            sui: JSON.parse(configs.sui || '{}'),
            hyperliquid: JSON.parse(configs.hyperliquid || '{}')
        };
    }

    private async subscribeToEvents(): Promise<void> {
        await this.eventBus.subscribe(
            'blockchain.transactions',
            `blockchain-gateway-${this.shardId}`,
            this.handleTransaction.bind(this)
        );
    }

    private async handleTransaction(request: TransactionRequest): Promise<void> {
        try {
            if (this.pendingTransactions.size >= this.maxConcurrentTx) {
                throw new Error('Transaction queue full');
            }

            const provider = this.providers.get(request.chainId);
            if (!provider) {
                throw new Error(`Provider not found for chain ${request.chainId}`);
            }

            // Add to pending transactions
            const txId = `${request.chainId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            this.pendingTransactions.set(txId, request);

            // Execute transaction
            const result = await this.executeTransaction(txId, request, provider);

            // Emit result
            await this.eventBus.publish('blockchain.results', {
                txId,
                ...result
            });

        } catch (error) {
            Logger.error('BlockchainGateway: Transaction handling error:', error);
            await this.eventBus.publish('blockchain.errors', {
                error: error.message,
                request
            });
        }
    }

    private async executeTransaction(
        txId: string,
        request: TransactionRequest,
        provider: ChainProvider
    ): Promise<TransactionResult> {
        try {
            let result: TransactionResult;

            switch (request.type) {
                case 'TRADE':
                    result = await provider.executeTrade(request.data);
                    break;
                case 'TRANSFER':
                    result = await provider.executeTransfer(request.data);
                    break;
                case 'SWAP':
                    result = await provider.executeSwap(request.data);
                    break;
                default:
                    throw new Error(`Unsupported transaction type: ${request.type}`);
            }

            // Cache successful transaction result
            await this.redis.setEx(
                `tx:${txId}`,
                3600, // 1 hour cache
                JSON.stringify(result)
            );

            return result;

        } catch (error) {
            Logger.error(`BlockchainGateway: Transaction ${txId} failed:`, error);
            throw error;
        } finally {
            this.pendingTransactions.delete(txId);
        }
    }

    private startTransactionMonitoring(): void {
        setInterval(async () => {
            try {
                // Monitor transaction status and cleanup completed/failed transactions
                for (const [txId, request] of this.pendingTransactions.entries()) {
                    const provider = this.providers.get(request.chainId);
                    if (!provider) continue;

                    const status = await provider.checkTransactionStatus(txId);
                    if (status !== 'PENDING') {
                        this.pendingTransactions.delete(txId);
                    }
                }

                // Update service registry metadata
                await this.registry.register({
                    id: this.shardId,
                    name: 'blockchain-gateway',
                    host: process.env.HOST || 'localhost',
                    port: parseInt(process.env.PORT || '3002'),
                    status: 'healthy',
                    metadata: {
                        pendingTx: this.pendingTransactions.size,
                        maxTx: this.maxConcurrentTx
                    }
                });
            } catch (error) {
                Logger.error('BlockchainGateway: Monitoring error:', error);
            }
        }, 5000); // Check every 5 seconds
    }

    async getTransactionStatus(txId: string): Promise<string> {
        // Check cache first
        const cached = await this.redis.get(`tx:${txId}`);
        if (cached) {
            return JSON.parse(cached).status;
        }

        // If not in cache, check with provider
        const request = this.pendingTransactions.get(txId);
        if (!request) {
            throw new Error(`Transaction ${txId} not found`);
        }

        const provider = this.providers.get(request.chainId);
        if (!provider) {
            throw new Error(`Provider not found for chain ${request.chainId}`);
        }

        return provider.checkTransactionStatus(txId);
    }
} 