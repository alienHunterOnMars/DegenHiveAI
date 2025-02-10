import { Plugin } from "@hiveai/utils";
import transferToken from "./actions/transfer";
import { WalletProvider, walletProvider } from "./providers/wallet";
import { SuiService } from "./services/sui";
import swapToken from "./actions/swap";

export { WalletProvider, transferToken as TransferSuiToken };

export const suiPlugin: Plugin = {
    name: "sui",
    description: "Sui Plugin for Eliza",
    actions: [transferToken, swapToken],
    evaluators: [],
    providers: [walletProvider],
    services: [new SuiService()],
};

export default suiPlugin;
