import {
    Logger,
    Service,
    ServiceType,
} from "@hiveai/utils";
import { SuiClient } from "@mysten/sui/client";
import { parseAccount, SuiNetwork } from "../utils";
import { AggregatorClient, Env } from "@cetusprotocol/aggregator-sdk";
import BN from "bn.js";
import { getTokenMetadata, TokenMetadata } from "../tokens";
import { Signer } from "@mysten/sui/cryptography";
import {
    Transaction,
    TransactionObjectArgument,
} from "@mysten/sui/transactions";

const aggregatorURL = "https://api-sui.cetus.zone/router_v2/find_routes";

interface SwapResult {
    success: boolean;
    tx: string;
    message: string;
}

export class SuiService extends Service {
    static serviceType: ServiceType = ServiceType.TRANSCRIPTION;
    private suiClient!: SuiClient;
    private network!: SuiNetwork;
    private wallet!: Signer;

    async initialize(config: any): Promise<void> {
        this.suiClient = new SuiClient({
            url: config.url,
        });
        this.network = config.network as SuiNetwork;

        return Promise.resolve();
    }

    async getTokenMetadata(token: string) {
        const meta = getTokenMetadata(token);
        return meta;
    }

    getAddress( privateKey: string ) {
        let wallet = parseAccount(privateKey);
        return wallet.toSuiAddress();
    }

    getAmount(amount: string | number, meta: TokenMetadata) {
        return BigInt(Number(amount) * Math.pow(10, meta.decimals));
    }

    getNetwork() {
        return this.network;
    }

    getTransactionLink(tx: string) {
        if (this.network === "mainnet") {
            return `https://suivision.xyz/txblock/${tx}`;
        } else if (this.network === "testnet") {
            return `https://testnet.suivision.xyz/txblock/${tx}`;
        } else if (this.network === "devnet") {
            return `https://devnet.suivision.xyz/txblock/${tx}`;
        } else if (this.network === "localnet") {
            return `localhost : ${tx}`;
        }
    }

    async transferToken(
        privateKey: string,
        recipient: string,
        amount: number | string,
        token: string
    ): Promise<any> {
        let wallet = parseAccount(privateKey);

        const tx = new Transaction();
        tx.setSender(wallet.toSuiAddress());
        // tx.transferObjects([coin], recipient);

        const result = await this.suiClient.signAndExecuteTransaction(
            { transaction: tx, signer: wallet }
        );
        await this.suiClient.waitForTransaction({
            digest: result.digest,
        });

        return {
            success: true,
            tx: result.digest,
            message: "Swap successful",
        };

    }


    async swapToken(
        privateKey: string,
        fromToken: string,
        amount: number | string,
        out_min_amount: number,
        targetToken: string
    ): Promise<SwapResult> {
        const fromMeta = getTokenMetadata(fromToken);
        const toMeta = getTokenMetadata(targetToken);
        
        if (!fromMeta?.tokenAddress || !toMeta?.tokenAddress) {
            throw new Error('Token metadata not found');
        }

        let wallet = parseAccount(privateKey);

        const client = new AggregatorClient(
            aggregatorURL,
            wallet.toSuiAddress(),
            this.suiClient,
            Env.Mainnet
        );
        // provider list : https://api-sui.cetus.zone/router_v2/status
        const routerRes = await client.findRouters({
            from: fromMeta.tokenAddress,
            target: toMeta.tokenAddress,
            amount: new BN(amount),
            byAmountIn: true, // `true` means fix input amount, `false` means fix output amount
            depth: 3, // max allow 3, means 3 hops
            providers: [
                "KRIYAV3",
                "CETUS",
                "SCALLOP",
                "KRIYA",
                "BLUEFIN",
                "DEEPBOOKV3",
                "FLOWXV3",
                "BLUEMOVE",
                "AFTERMATH",
                "FLOWX",
                "TURBOS",
                // "AFSUI",
                // "VOLO",
                // "SPRINGSUI",
                // "ALPHAFI",
                // "HAEDAL",
                // "HAEDALPMM",
            ],
        });

        if (routerRes === null) {
            Logger.error(
                "No router found" +
                    JSON.stringify({
                        from: fromMeta.tokenAddress,
                        target: toMeta.tokenAddress,
                        amount: amount,
                    })
            );
            return {
                success: false,
                tx: "",
                message: "No router found",
            };
        }

        if (routerRes.amountOut.toNumber() < out_min_amount) {
            return {
                success: false,
                tx: "",
                message: "Out amount is less than out_min_amount",
            };
        }

        let coin: TransactionObjectArgument;
        const routerTx = new Transaction();

        if (fromToken.toUpperCase() === "SUI") {
            coin = routerTx.splitCoins(routerTx.gas, [amount]);
        } else {
            const allCoins = await this.suiClient.getCoins({
                owner: wallet.toSuiAddress(),
                coinType: fromMeta.tokenAddress,
                limit: 30,
            });

            if (allCoins.data.length === 0) {
                Logger.error("No coins found");
                return {
                    success: false,
                    tx: "",
                    message: "No coins found",
                };
            }

            const mergeCoins = [];

            for (let i = 1; i < allCoins.data.length; i++) {
                Logger.info("Coin:", allCoins.data[i]);
                mergeCoins.push(allCoins.data[i].coinObjectId);
            }
            Logger.info("Merge coins:", mergeCoins);

            routerTx.mergeCoins(allCoins.data[0].coinObjectId, mergeCoins);
            coin = routerTx.splitCoins(allCoins.data[0].coinObjectId, [amount]);
        }

        const targetCoin = await client.routerSwap({
            routers: routerRes!.routes,
            byAmountIn: true,
            txb: routerTx,
            inputCoin: coin,
            slippage: 0.5,
        });

        // checking threshold

        // routerTx.moveCall({
        //     package:
        //         "0x57d4f00af225c487fd21eed6ee0d11510d04347ee209d2ab48d766e48973b1a4",
        //     module: "utils",
        //     function: "check_coin_threshold",
        //     arguments: [
        //         targetCoin,
        //         routerTx.pure(bcs.U64.serialize(out_min_amount)),
        //     ],
        //     typeArguments: [otherType],
        // });
        routerTx.transferObjects([targetCoin], wallet.toSuiAddress());
        routerTx.setSender(wallet.toSuiAddress());
        const result = await client.signAndExecuteTransaction(
            routerTx,
            wallet
        );

        await this.suiClient.waitForTransaction({
            digest: result.digest,
        });

        return {
            success: true,
            tx: result.digest,
            message: "Swap successful",
        };
    }
}
