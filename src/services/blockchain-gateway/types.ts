// export interface TransactionRequest {
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

// export interface TransactionResult {
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