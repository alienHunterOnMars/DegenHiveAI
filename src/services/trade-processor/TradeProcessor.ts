import { Logger } from '@hiveai/utils';
import { KafkaEventBus } from '../../infrastructure/KafkaEventBus';
import { ServiceRegistry } from '../../infrastructure/ServiceRegistry';
import { RedisClient } from '../../infrastructure/RedisClient';
import { OrderBook } from './OrderBook';
import { TradeValidator } from './TradeValidator';
import { BlockchainGateway } from '../blockchain-gateway/BlockchainGateway';

interface TradeRequest {
    userId: string;
    agentId: string;
    orderId: string;
    chainId: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    deadline: number;
    type: 'MARKET' | 'LIMIT';
    limitPrice?: string;
}

interface OrderState {
    orderId: string;
    status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
    txHash?: string;
    error?: string;
}

export class TradeProcessor {
    private orderBooks: Map<string, OrderBook>;
    private pendingOrders: Map<string, OrderState>;
    private readonly maxOrdersPerShard = 10000;
    private shardId: string;

    constructor(
        private eventBus: KafkaEventBus,
        private registry: ServiceRegistry,
        private redis: RedisClient,
        private blockchainGateway: BlockchainGateway,
        private validator: TradeValidator,
        shardId: string
    ) {
        this.orderBooks = new Map();
        this.pendingOrders = new Map();
        this.shardId = shardId;
    }

    async start(): Promise<void> {
        try {
            // Register service
            await this.registry.register({
                id: this.shardId,
                name: 'trade-processor',
                host: process.env.HOST || 'localhost',
                port: parseInt(process.env.PORT || '3001'),
                status: 'healthy',
                metadata: {
                    orderCount: 0,
                    maxOrders: this.maxOrdersPerShard
                }
            });

            // Initialize order books
            await this.initializeOrderBooks();

            // Subscribe to trade events
            await this.subscribeToEvents();

            // Start order processing loop
            this.startOrderProcessing();

            Logger.info(`TradeProcessor shard ${this.shardId} started`);
        } catch (error) {
            Logger.error('TradeProcessor: Failed to start:', error);
            throw error;
        }
    }

    private async initializeOrderBooks(): Promise<void> {
        // Initialize order books for different trading pairs
        const pairs = await this.redis.smembers('trading:active_pairs');
        for (const pair of pairs) {
            this.orderBooks.set(pair, new OrderBook(pair, this.redis));
        }
    }

    private async subscribeToEvents(): Promise<void> {
        await this.eventBus.subscribe(
            'trade.requests',
            `trade-processor-${this.shardId}`,
            this.handleTradeRequest.bind(this)
        );

        await this.eventBus.subscribe(
            'trade.cancellations',
            `trade-processor-${this.shardId}`,
            this.handleTradeCancellation.bind(this)
        );
    }

    private async handleTradeRequest(request: TradeRequest): Promise<void> {
        try {
            // Validate trade request
            await this.validator.validateTrade(request);

            // Create order state
            const orderState: OrderState = {
                orderId: request.orderId,
                status: 'PENDING'
            };
            this.pendingOrders.set(request.orderId, orderState);

            // Add to appropriate order book
            const pair = `${request.tokenIn}-${request.tokenOut}`;
            const orderBook = this.orderBooks.get(pair);
            if (!orderBook) {
                throw new Error(`Order book not found for pair ${pair}`);
            }

            if (request.type === 'LIMIT') {
                await orderBook.addLimitOrder(request);
            } else {
                await this.executeMarketOrder(request);
            }

        } catch (error) {
            Logger.error('TradeProcessor: Trade request handling error:', error);
            await this.updateOrderState(request.orderId, 'FAILED', { error: error.message });
        }
    }

    private async executeMarketOrder(request: TradeRequest): Promise<void> {
        try {
            const orderState = this.pendingOrders.get(request.orderId);
            if (!orderState) return;

            orderState.status = 'EXECUTING';

            // Execute trade through blockchain gateway
            const result = await this.blockchainGateway.executeTrade({
                chainId: request.chainId,
                tokenIn: request.tokenIn,
                tokenOut: request.tokenOut,
                amountIn: request.amountIn,
                minAmountOut: request.minAmountOut,
                deadline: request.deadline
            });

            await this.updateOrderState(request.orderId, 'COMPLETED', { 
                txHash: result.txHash 
            });

            // Emit trade completion event
            await this.eventBus.publish('trade.completed', {
                orderId: request.orderId,
                txHash: result.txHash,
                timestamp: Date.now()
            });

        } catch (error) {
            Logger.error('TradeProcessor: Market order execution error:', error);
            await this.updateOrderState(request.orderId, 'FAILED', { error: error.message });
        }
    }

    private async updateOrderState(
        orderId: string, 
        status: OrderState['status'], 
        details: Partial<OrderState>
    ): Promise<void> {
        const orderState = this.pendingOrders.get(orderId);
        if (!orderState) return;

        Object.assign(orderState, { status, ...details });
        await this.redis.hSet(`order:${orderId}`, orderState);
    }

    private startOrderProcessing(): void {
        setInterval(async () => {
            try {
                // Process limit orders that can be executed
                for (const orderBook of this.orderBooks.values()) {
                    await orderBook.processLimitOrders();
                }

                // Update service registry metadata
                await this.registry.register({
                    id: this.shardId,
                    name: 'trade-processor',
                    host: process.env.HOST || 'localhost',
                    port: parseInt(process.env.PORT || '3001'),
                    status: 'healthy',
                    metadata: {
                        orderCount: this.pendingOrders.size,
                        maxOrders: this.maxOrdersPerShard
                    }
                });
            } catch (error) {
                Logger.error('TradeProcessor: Order processing error:', error);
            }
        }, 1000); // Process orders every second
    }

    private async handleTradeCancellation(message: any): Promise<void> {
        try {
            const { orderId, userId } = message;
            const orderState = this.pendingOrders.get(orderId);
            
            if (!orderState || orderState.status === 'COMPLETED') {
                throw new Error('Order cannot be cancelled');
            }

            // Cancel order in order book
            for (const orderBook of this.orderBooks.values()) {
                await orderBook.cancelOrder(orderId, userId);
            }

            await this.updateOrderState(orderId, 'FAILED', { 
                error: 'Order cancelled by user' 
            });

        } catch (error) {
            Logger.error('TradeProcessor: Trade cancellation error:', error);
        }
    }
} 