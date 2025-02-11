// import { Logger } from '@hiveai/utils';
// import { KafkaEventBus } from '../../infrastructure/KafkaEventBus';
// import { ServiceRegistry } from '../../infrastructure/ServiceRegistry';
// import { RedisClient } from '../../infrastructure/RedisClient';
// import { ChainProvider } from './providers/ChainProvider';
// import { SolanaProvider } from './providers/SolanaProvider';
// import { SuiProvider } from './providers/SuiProvider';
// import { HyperliquidProvider } from './providers/HyperliquidProvider';

// interface TransactionRequest {
//     id: string;
//     chainId: string;
//     type: 'TRADE' | 'TRANSFER' | 'SWAP' | 'LIMIT_ORDER';
//     data: {
//         tokenIn?: string;
//         tokenOut?: string;
//         amountIn?: string;
//         amountOut?: string;
//         slippage?: number;
//         recipient?: string;
//         deadline?: number;
//         limitPrice?: string;
//         orderType?: 'MARKET' | 'LIMIT';
//         leverage?: number;
//         stopLoss?: string;
//         takeProfit?: string;
//     };
//     metadata: {
//         userId: string;
//         platform: string;
//         priority: number;
//         timestamp: number;
//     };
// }

// interface TransactionResult {
//     txId: string;
//     status: 'SUCCESS' | 'FAILED' | 'PENDING';
//     hash?: string;
//     error?: string;
//     details?: {
//         blockNumber?: number;
//         confirmations?: number;
//         gasUsed?: string;
//         effectivePrice?: string;
//         outputAmount?: string;
//         fee?: string;
//     };
// }

// interface ChainConfig {
//     rpcUrl: string;
//     wsUrl?: string;
//     chainId: string;
//     maxRetries: number;
//     timeout: number;
//     batchSize: number;
//     confirmations: number;
// }

// export class BlockchainGateway {
//     private providers: Map<string, ChainProvider>;
//     private pendingTransactions: Map<string, TransactionRequest>;
//     private processingQueues: Map<string, TransactionRequest[]>;
//     private readonly maxConcurrentTx: number;
//     private readonly maxQueueSize: number;
//     private isProcessing: boolean = false;
//     private healthCheckInterval: NodeJS.Timer | null = null;

//     constructor(
//         private eventBus: KafkaEventBus,
//         private registry: ServiceRegistry,
//         private redis: RedisClient,
//         private shardId: string,
//         maxConcurrentTx: number = 1000,
//         maxQueueSize: number = 10000
//     ) {
//         this.providers = new Map();
//         this.pendingTransactions = new Map();
//         this.processingQueues = new Map();
//         this.maxConcurrentTx = maxConcurrentTx;
//         this.maxQueueSize = maxQueueSize;
//     }

//     async start(): Promise<void> {
//         try {
//             // Initialize blockchain providers
//             await this.initializeProviders();

//             // Register service
//             await this.registerService();

//             // Subscribe to transaction events
//             await this.subscribeToEvents();

//             // Start transaction processing
//             this.startTransactionProcessing();

//             // Start health monitoring
//             this.startHealthMonitoring();

//             Logger.info(`BlockchainGateway shard ${this.shardId} started`);
//         } catch (error) {
//             Logger.error('BlockchainGateway: Failed to start:', error);
//             throw error;
//         }
//     }

//     private async initializeProviders(): Promise<void> {
//         const configs = await this.loadChainConfigs();

//         // Initialize providers with configurations
//         this.providers.set('solana', new SolanaProvider(configs.solana));
//         this.providers.set('sui', new SuiProvider(configs.sui));
//         this.providers.set('hyperliquid', new HyperliquidProvider(configs.hyperliquid));

//         // Initialize processing queues for each chain
//         for (const chainId of this.providers.keys()) {
//             this.processingQueues.set(chainId, []);
//         }

//         // Initialize connections
//         await Promise.all(
//             Array.from(this.providers.values()).map(provider => provider.initialize())
//         );
//     }

//     private async loadChainConfigs(): Promise<Record<string, ChainConfig>> {
//         const configs = await this.redis.hGetAll('chain:configs');
//         return {
//             solana: JSON.parse(configs.solana || '{}'),
//             sui: JSON.parse(configs.sui || '{}'),
//             hyperliquid: JSON.parse(configs.hyperliquid || '{}')
//         };
//     }

//     private async registerService(): Promise<void> {
//         await this.registry.register({
//             id: this.shardId,
//             name: 'blockchain-gateway',
//             host: process.env.HOST || 'localhost',
//             port: parseInt(process.env.PORT || '3002'),
//             status: 'healthy',
//             metadata: {
//                 pendingTx: 0,
//                 maxTx: this.maxConcurrentTx,
//                 supportedChains: Array.from(this.providers.keys())
//             }
//         });
//     }

//     private async subscribeToEvents(): Promise<void> {
//         await this.eventBus.subscribe(
//             'blockchain.transactions',
//             `blockchain-gateway-${this.shardId}`,
//             this.handleTransaction.bind(this),
//             { autoCommit: false }
//         );

//         await this.eventBus.subscribe(
//             'blockchain.cancellations',
//             `blockchain-gateway-${this.shardId}`,
//             this.handleCancellation.bind(this)
//         );
//     }

//     private async handleTransaction(request: TransactionRequest): Promise<void> {
//         try {
//             // Validate transaction request
//             await this.validateRequest(request);

//             // Add to processing queue
//             const queue = this.processingQueues.get(request.chainId);
//             if (!queue) {
//                 throw new Error(`Unsupported chain: ${request.chainId}`);
//             }

//             if (queue.length >= this.maxQueueSize) {
//                 throw new Error('Transaction queue full');
//             }

//             // Add to queue with priority
//             this.addToQueue(queue, request);

//             // Trigger processing if not already running
//             if (!this.isProcessing) {
//                 this.processTransactionQueues();
//             }

//         } catch (error) {
//             Logger.error('BlockchainGateway: Transaction handling error:', error);
//             await this.handleTransactionError(request, error);
//         }
//     }

//     private async validateRequest(request: TransactionRequest): Promise<void> {
//         const provider = this.providers.get(request.chainId);
//         if (!provider) {
//             throw new Error(`Provider not found for chain ${request.chainId}`);
//         }

//         await provider.validateTransaction(request);
//     }

//     private addToQueue(queue: TransactionRequest[], request: TransactionRequest): void {
//         // Insert based on priority
//         const insertIndex = queue.findIndex(tx => 
//             tx.metadata.priority > request.metadata.priority
//         );

//         if (insertIndex === -1) {
//             queue.push(request);
//         } else {
//             queue.splice(insertIndex, 0, request);
//         }
//     }

//     private async processTransactionQueues(): Promise<void> {
//         if (this.isProcessing) return;
//         this.isProcessing = true;

//         try {
//             while (this.hasTransactionsToProcess()) {
//                 for (const [chainId, queue] of this.processingQueues.entries()) {
//                     if (queue.length === 0) continue;

//                     const provider = this.providers.get(chainId);
//                     if (!provider) continue;

//                     // Process transactions in batches
//                     await this.processBatch(chainId, provider, queue);
//                 }
//             }
//         } catch (error) {
//             Logger.error('BlockchainGateway: Queue processing error:', error);
//         } finally {
//             this.isProcessing = false;
//         }
//     }

//     private async processBatch(
//         chainId: string,
//         provider: ChainProvider,
//         queue: TransactionRequest[]
//     ): Promise<void> {
//         const batch = queue.splice(0, provider.getBatchSize());
//         const results: TransactionResult[] = [];

//         for (const tx of batch) {
//             try {
//                 const result = await this.executeTransaction(provider, tx);
//                 results.push(result);

//                 // Cache result
//                 await this.cacheTransactionResult(tx.id, result);

//                 // Publish result
//                 await this.publishResult(tx, result);
//             } catch (error) {
//                 Logger.error(`Transaction ${tx.id} failed:`, error);
//                 await this.handleTransactionError(tx, error);
//             }
//         }
//     }

//     private async executeTransaction(
//         provider: ChainProvider,
//         request: TransactionRequest
//     ): Promise<TransactionResult> {
//         try {
//             let result: TransactionResult;

//             switch (request.type) {
//                 case 'TRADE':
//                     result = await provider.executeTrade(request.data);
//                     break;
//                 case 'TRANSFER':
//                     result = await provider.executeTransfer(request.data);
//                     break;
//                 case 'SWAP':
//                     result = await provider.executeSwap(request.data);
//                     break;
//                 case 'LIMIT_ORDER':
//                     result = await provider.executeLimitOrder(request.data);
//                     break;
//                 default:
//                     throw new Error(`Unsupported transaction type: ${request.type}`);
//             }

//             // Cache successful transaction result
//             await this.redis.setEx(
//                 `tx:${request.id}`,
//                 3600, // 1 hour cache
//                 JSON.stringify(result)
//             );

//             return result;

//         } catch (error) {
//             Logger.error(`BlockchainGateway: Transaction ${request.id} failed:`, error);
//             throw error;
//         }
//     }

//     private async cacheTransactionResult(txId: string, result: TransactionResult): Promise<void> {
//         await this.redis.setEx(
//             `tx:${txId}`,
//             3600, // 1 hour cache
//             JSON.stringify(result)
//         );
//     }

//     private async publishResult(request: TransactionRequest, result: TransactionResult): Promise<void> {
//         await this.eventBus.publish('blockchain.results', {
//             txId: request.id,
//             ...result
//         });
//     }

//     private async handleTransactionError(request: TransactionRequest, error: Error): Promise<void> {
//         await this.eventBus.publish('blockchain.errors', {
//             error: error.message,
//             request
//         });
//     }

//     private startTransactionProcessing(): void {
//         setInterval(async () => {
//             try {
//                 // Monitor transaction status and cleanup completed/failed transactions
//                 for (const [txId, request] of this.pendingTransactions.entries()) {
//                     const provider = this.providers.get(request.chainId);
//                     if (!provider) continue;

//                     const status = await provider.checkTransactionStatus(txId);
//                     if (status !== 'PENDING') {
//                         this.pendingTransactions.delete(txId);
//                     }
//                 }

//                 // Update service registry metadata
//                 await this.registry.register({
//                     id: this.shardId,
//                     name: 'blockchain-gateway',
//                     host: process.env.HOST || 'localhost',
//                     port: parseInt(process.env.PORT || '3002'),
//                     status: 'healthy',
//                     metadata: {
//                         pendingTx: this.pendingTransactions.size,
//                         maxTx: this.maxConcurrentTx
//                     }
//                 });
//             } catch (error) {
//                 Logger.error('BlockchainGateway: Monitoring error:', error);
//             }
//         }, 5000); // Check every 5 seconds
//     }

//     private startHealthMonitoring(): void {
//         setInterval(async () => {
//             try {
//                 // Check service health
//                 const health = await this.checkServiceHealth();
//                 if (!health) {
//                     Logger.warn('BlockchainGateway: Service health check failed');
//                 }
//             } catch (error) {
//                 Logger.error('BlockchainGateway: Health monitoring error:', error);
//             }
//         }, 60000); // Check every 1 minute
//     }

//     private async checkServiceHealth(): Promise<boolean> {
//         // Implement service health check logic
//         return true; // Placeholder return, actual implementation needed
//     }

//     async getTransactionStatus(txId: string): Promise<string> {
//         // Check cache first
//         const cached = await this.redis.get(`tx:${txId}`);
//         if (cached) {
//             return JSON.parse(cached).status;
//         }

//         // If not in cache, check with provider
//         const request = this.pendingTransactions.get(txId);
//         if (!request) {
//             throw new Error(`Transaction ${txId} not found`);
//         }

//         const provider = this.providers.get(request.chainId);
//         if (!provider) {
//             throw new Error(`Provider not found for chain ${request.chainId}`);
//         }

//         return provider.checkTransactionStatus(txId);
//     }
// } 