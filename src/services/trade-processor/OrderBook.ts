import { RedisClient } from '../../infrastructure/RedisClient';
import { Logger } from '@hiveai/utils';
import BigNumber from 'bignumber.js';

interface LimitOrder {
    orderId: string;
    userId: string;
    price: string;
    amount: string;
    side: 'BUY' | 'SELL';
    timestamp: number;
}

export class OrderBook {
    private readonly buyOrdersKey: string;
    private readonly sellOrdersKey: string;

    constructor(
        private pair: string,
        private redis: RedisClient
    ) {
        this.buyOrdersKey = `orderbook:${pair}:buys`;
        this.sellOrdersKey = `orderbook:${pair}:sells`;
    }

    async addLimitOrder(order: LimitOrder): Promise<void> {
        const key = order.side === 'BUY' ? this.buyOrdersKey : this.sellOrdersKey;
        
        // Store order with price as score for sorting
        await this.redis.zAdd(key, {
            score: parseFloat(order.price),
            value: JSON.stringify(order)
        });

        Logger.info(`OrderBook: Added ${order.side} order for ${this.pair} at ${order.price}`);
    }

    async processLimitOrders(): Promise<void> {
        try {
            // Get best buy and sell orders
            const bestBuy = await this.getBestBuyOrder();
            const bestSell = await this.getBestSellOrder();

            if (!bestBuy || !bestSell) return;

            // Check if orders can be matched
            const buyPrice = new BigNumber(bestBuy.price);
            const sellPrice = new BigNumber(bestSell.price);

            if (buyPrice.isGreaterThanOrEqualTo(sellPrice)) {
                await this.matchOrders(bestBuy, bestSell);
            }
        } catch (error) {
            Logger.error('OrderBook: Error processing limit orders:', error);
        }
    }

    private async getBestBuyOrder(): Promise<LimitOrder | null> {
        const orders = await this.redis.zRevRange(this.buyOrdersKey, 0, 0);
        return orders.length ? JSON.parse(orders[0]) : null;
    }

    private async getBestSellOrder(): Promise<LimitOrder | null> {
        const orders = await this.redis.zRange(this.sellOrdersKey, 0, 0);
        return orders.length ? JSON.parse(orders[0]) : null;
    }

    private async matchOrders(buy: LimitOrder, sell: LimitOrder): Promise<void> {
        // Implement order matching logic
        // This would execute trades and update order states
    }

    async cancelOrder(orderId: string, userId: string): Promise<void> {
        // Remove order from both buy and sell sets
        const keys = [this.buyOrdersKey, this.sellOrdersKey];
        
        for (const key of keys) {
            const orders = await this.redis.zRange(key, 0, -1);
            for (const orderStr of orders) {
                const order = JSON.parse(orderStr);
                if (order.orderId === orderId && order.userId === userId) {
                    await this.redis.zRem(key, orderStr);
                    Logger.info(`OrderBook: Cancelled order ${orderId}`);
                    return;
                }
            }
        }
    }
} 