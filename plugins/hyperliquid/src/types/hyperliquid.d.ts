declare module 'hyperliquid' {
    export class Hyperliquid {
        public info: {
            spot: {
                getSpotMetaAndAssetCtxs(): Promise<[
                    { tokens: Array<{ name: string }> },
                    Array<{
                        coin: string;
                        midPx: string;
                        prevDayPx: string;
                        dayNtlVlm: string;
                    }>
                ]>;
            };
        };
        
        public exchange: {
            placeOrder(order: {
                coin: string;
                asset: number;
                is_buy: boolean;
                sz: number;
                limit_px: number;
                reduce_only: boolean;
                order_type: { market: {} } | { limit: { tif: 'Gtc' | 'Ioc' } };
            }): Promise<{
                status: string;
                response?: {
                    type: string;
                    data?: {
                        statuses?: Array<{
                            error?: string;
                            px?: number;
                        }>;
                    };
                };
            }>;
        };

        public custom: {
            cancelAllOrders(): Promise<{
                status: string;
                response?: {
                    data?: {
                        statuses?: Array<any>;
                    };
                };
            }>;
        };

        constructor(config?: { 
            privateKey?: string;
            testnet?: boolean;
            enableWs?: boolean;
            walletAddress?: string;
            vaultAddress?: string;
        });
        
        connect(): Promise<void>;
        disconnect(): void;
        isAuthenticated(): boolean;
    }
} 