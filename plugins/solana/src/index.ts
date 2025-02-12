import { Plugin } from "@hiveai/utils";
import { Logger } from "@hiveai/utils";
import { Connection } from "@solana/web3.js";
import transferToken, { type TransferParams } from "./actions/transfer";
import transferSol from "./actions/transfer_sol";
import { executeSwap, type SwapParams } from "./actions/swap";
import pumpfun, { type PumpFunParams } from "./actions/pumpfun";
import fomo from "./actions/fomo";
import { TokenProvider } from "./providers/token";
import { WalletProvider, walletProvider } from "./providers/wallet";
import { trustScoreProvider } from "./providers/trustScoreProvider";
import { getWalletKey } from "./keypairUtils";

export { TokenProvider, WalletProvider };
export type { TransferParams, SwapParams, PumpFunParams };

export interface SolanaPluginConfig {
    network_urls: Record<string, string>;
    default_rpc?: string;
    helius_api_key?: string;
    birdeye_api_key?: string;
}

export interface SolanaActionParams {
    type: "SWAP" | "TRANSFER" | "TRANSFER_SOL" | "TAKE_ORDER" | "PUMP_FUN" | "FOMO" | "SWAP_DAO";
    privateKey: string;
    params: any;
    is_simulation: boolean;
}

export const solanaPlugin = {
    name: "solana",
    description: "Solana Plugin for Hive AI",
    actions: [
        transferToken,
        transferSol,
        executeSwap,
        pumpfun,
        fomo
    ],
    evaluators: [],
    providers: [walletProvider, trustScoreProvider],
    connection: null as Connection | null,
    config: {} as SolanaPluginConfig,

    async init(config: SolanaPluginConfig) {
        this.config = config;
        this.connection = new Connection(
            config.default_rpc || config.network_urls["mainnet"] || "https://api.mainnet-beta.solana.com",
            {
                commitment: "confirmed",
                confirmTransactionInitialTimeout: 120000,
            }
        );
        Logger.info('Solana Plugin: Initialized successfully');
    },

    async start() {
        if (!this.connection) {
            throw new Error("Solana plugin not initialized");
        }
        Logger.info('Solana Plugin: Started');
    },

    async stop() {
        Logger.info('Solana Plugin: Stopped');
    },

    async useAction(action: SolanaActionParams): Promise<any> {
        if (!this.connection) {
            throw new Error("Solana plugin not initialized");
        }

        try {
            Logger.info(`Executing Solana action: ${action.type}`);
            
            // Get the keypair from the provided private key
            const keypair = await getWalletKey(action.privateKey);
            
            switch (action.type) {
                case "SWAP":
                    if (!action.params.inputToken || !action.params.outputToken || !action.params.amount) {
                        throw new Error("Missing required parameters for swap");
                    }
                    return await executeSwap.handler( {
                        connection: this.connection, 
                        keypair,
                        inputToken: action.params.inputToken,
                        outputToken: action.params.outputToken,
                        amount: action.params.amount,
                        slippage: action.params.slippage || 1
                    });

                case "TRANSFER":
                    if (!action.params.recipient || !action.params.amount || !action.params.tokenAddress) {
                        throw new Error("Missing required parameters for transfer");
                    }
                    return await transferToken.handler(
                        {   connection: this.connection, 
                            keypair,
                            recipient: action.params.recipient,
                            tokenAddress: action.params.tokenAddress,
                            amount: action.params.amount
                    });

                case "TRANSFER_SOL":
                    if (!action.params.recipient || !action.params.amount) {
                        throw new Error("Missing required parameters for SOL transfer");
                    }
                    return await transferSol.handler(
                        { connection: this.connection, 
                            keypair,
                            recipient: action.params.recipient,
                            amount: action.params.amount
                        }
                    );

                case "PUMP_FUN":
                    if (!action.params.tokenMetadata || !action.params.buyAmountSol) {
                        throw new Error("Missing required parameters for pump fun");
                    }
                    return await pumpfun.handler(
                        { connection: this.connection, 
                            keypair,
                            function_name: action.params.function_name,
                            params: action.params.params
                        }
                    );

                case "FOMO":
                    if (!action.params.tokenMetadata || !action.params.buyAmountSol) {
                        throw new Error("Missing required parameters for fomo");
                    }
                    return await fomo.handler(
                        { connection: this.connection, keypair },
                        action.params
                    );

                default:
                    throw new Error(`Unsupported action type: ${action.type}`);
            }
        } catch (error: any) {
            Logger.error(`Failed to execute Solana action ${action.type}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

export default solanaPlugin;