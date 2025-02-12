import { Plugin } from "@hiveai/utils";
import transferToken from "./actions/transfer";
import { WalletProvider, walletProvider } from "./providers/wallet";
import { SuiService } from "./services/sui";
import swapToken from "./actions/swap";
import { Logger } from "@hiveai/utils";
export { WalletProvider, transferToken as TransferSuiToken };

export interface SuiPluginConfig {
    network_urls: Record<string, string>;
}

export interface SuiActionParams {
    type: "SWAP" | "TRANSFER";
    privateKey: string;
    params: any;
    is_simulation: boolean;
}




export const suiPlugin = {
    name: "sui",
    description: "Sui Plugin for Hive AI",
    actions: [transferToken, swapToken],
    evaluators: [],
    providers: [walletProvider],
    services: new SuiService(),
    config: {},

    async init(config: SuiPluginConfig) {
        this.config = config;
        await this.services.initialize(config);
        Logger.info('Sui Plugin: Initialized successfully');
    },

    async start() {
        Logger.info('Sui Plugin: Started');
    },

    async stop() {
        Logger.info('Sui Plugin: Stopped');
    },

    async useAction(action: SuiActionParams): Promise<any> {
        if (!this.services) {
            throw new Error("Sui plugin not initialized");
        }

        try {
            Logger.info(`Executing Sui action: ${action.type}`);
            
            switch (action.type) {
                case "SWAP":
                    if (!action.params.fromToken || !action.params.toToken || !action.params.amount) {
                        throw new Error("Missing required parameters for swap");
                    }
                    return await this.services.swapToken(
                        action.privateKey,
                        action.params.fromToken,
                        action.params.amount,
                        action.params.toToken,
                        action.params.slippage || 0.5
                    );

                case "TRANSFER":
                    if (!action.params.recipient || !action.params.amount) {
                        throw new Error("Missing required parameters for transfer");
                    }
                    return await this.services.transferToken(
                        action.privateKey,
                        action.params.recipient,
                        action.params.amount,
                        action.params.token || "SUI"
                    );

                default:
                    throw new Error(`Unsupported action type: ${action.type}`);
            }
        } catch (error: any) {
            Logger.error(`Failed to execute Sui action ${action.type}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }




};

export default suiPlugin;
