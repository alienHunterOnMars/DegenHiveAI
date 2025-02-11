// import { TransactionRequest, TransactionResult } from '../types';

// export interface ChainProvider {
//     initialize(): Promise<void>;
//     validateTransaction(request: TransactionRequest): Promise<void>;
//     executeTrade(data: TransactionRequest['data']): Promise<TransactionResult>;
//     executeTransfer(data: TransactionRequest['data']): Promise<TransactionResult>;
//     executeSwap(data: TransactionRequest['data']): Promise<TransactionResult>;
//     executeLimitOrder(data: TransactionRequest['data']): Promise<TransactionResult>;
//     checkTransactionStatus(txId: string): Promise<string>;
//     getBatchSize(): number;
//     getHealth(): Promise<boolean>;
// }

// export abstract class BaseChainProvider implements ChainProvider {
//     protected config: any;
//     protected isInitialized: boolean = false;
//     protected readonly defaultBatchSize: number = 10;

//     constructor(config: any) {
//         this.config = config;
//     }

//     abstract initialize(): Promise<void>;
//     abstract validateTransaction(request: TransactionRequest): Promise<void>;
//     abstract executeTrade(data: TransactionRequest['data']): Promise<TransactionResult>;
//     abstract executeTransfer(data: TransactionRequest['data']): Promise<TransactionResult>;
//     abstract executeSwap(data: TransactionRequest['data']): Promise<TransactionResult>;
//     abstract executeLimitOrder(data: TransactionRequest['data']): Promise<TransactionResult>;
//     abstract checkTransactionStatus(txId: string): Promise<string>;

//     getBatchSize(): number {
//         return this.config.batchSize || this.defaultBatchSize;
//     }

//     async getHealth(): Promise<boolean> {
//         return this.isInitialized;
//     }

//     protected validateAmount(amount: string): void {
//         if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
//             throw new Error('Invalid amount');
//         }
//     }

//     protected validateAddress(address: string): void {
//         if (!address || typeof address !== 'string') {
//             throw new Error('Invalid address');
//         }
//     }
// } 