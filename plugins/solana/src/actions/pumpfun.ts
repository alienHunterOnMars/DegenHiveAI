import { Logger } from "@hiveai/utils";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { Fomo, type PurchaseCurrency } from "fomo-sdk-solana";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import {
    settings,
    type ActionExample,
    type Content,
    type HandlerCallback,
    type Memory,
    ModelClass,
    type State,
    generateObject,
    composeContext,
    type Action,
} from "@hiveai/utils";

export interface TokenMetadata {
    name: string;
    symbol: string;
    description: string;
    image_description: string;
    uri?: string;
}

export interface PumpFunParams {
    connection: Connection;
    keypair: Keypair;
    function_name: "createAndBuyToken" | "buyToken" | "sellToken";
    params: {
        tokenMetadata?: TokenMetadata;
        buyAmountSol?: number;
        mint?: string;
        amount?: number;
        priorityFee?: number;
        requiredLiquidity?: number;
        allowOffCurve?: boolean;
        slippage?: string | number;
    };
}

export default {    
    name: "PUMP_FUN",
    description: "Trade tokens on Pump.fun",

    async handler({
        connection,
        keypair,
        function_name,
        params
    }: PumpFunParams): Promise<any> {

        // Initialize FOMO SDK with mainnet cluster
        const fomo = new Fomo(connection, "mainnet-beta", keypair);

        if (function_name === "createAndBuyToken") {
            if (!params.tokenMetadata || !params.buyAmountSol) {
                throw new Error("Missing required parameters: tokenMetadata and buyAmountSol");
            }
            return await createAndBuyToken({
                deployer: keypair,
                mint: keypair,
                tokenMetadata: params.tokenMetadata,
                buyAmountSol: params.buyAmountSol,
                priorityFee: params.priorityFee || 100_000,
                requiredLiquidity: params.requiredLiquidity || 85,
                allowOffCurve: params.allowOffCurve || false,
                connection: connection,
                fomo: fomo,
                slippage: String(params.slippage || "1000")
            });
        }

        if (function_name === "buyToken") {
            if (!params.mint || !params.amount) {
                throw new Error("Missing required parameters: mint and amount");
            }
            return await buyToken({
                fomo: fomo,
                buyer: keypair,
                mint: new PublicKey(params.mint),
                amount: Number(params.amount),
                priorityFee: Number(params.priorityFee) || 100_000,
                allowOffCurve: Boolean(params.allowOffCurve),
                slippage: Number(params.slippage) || 1,
                connection: connection,
                currency: "sol" as PurchaseCurrency,
                commitment: "confirmed"
            });
        }

        if (function_name === "sellToken") {
            if (!params.mint || !params.amount) {
                throw new Error("Missing required parameters: mint and amount");
            }
            return await sellToken({
                fomo: fomo,
                seller: keypair,
                mint: new PublicKey(params.mint),
                amount: Number(params.amount),
                priorityFee: Number(params.priorityFee) || 100_000,
                slippage: Number(params.slippage) || 1,
                allowOffCurve: Boolean(params.allowOffCurve),
                connection: connection,
                currency: "token" as PurchaseCurrency,
                commitment: "confirmed"
            });
        }
    }
};

const createAndBuyToken = async ({
    deployer,
    mint,
    tokenMetadata,
    buyAmountSol,
    priorityFee,
    requiredLiquidity,
    allowOffCurve,
    connection,
    fomo,
    slippage
}: {
    deployer: Keypair;
    mint: Keypair;
    tokenMetadata: TokenMetadata;
    buyAmountSol: number;
    priorityFee: number;
    requiredLiquidity: number;
    allowOffCurve: boolean;
    connection: Connection;
    fomo: Fomo;
    slippage: string;
}) => {
    const { transaction: versionedTx } = await fomo.createToken(
        deployer.publicKey,
        tokenMetadata.name,
        tokenMetadata.symbol,
        tokenMetadata.uri || "",
        priorityFee,
        bs58.encode(mint.secretKey),
        requiredLiquidity,
        Number(buyAmountSol) / 10 ** 9
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    versionedTx.message.recentBlockhash = blockhash;
    versionedTx.sign([mint]);

    const serializedTransaction = versionedTx.serialize();
    const serializedTransactionBase64 = Buffer.from(serializedTransaction).toString("base64");
    const deserializedTx = VersionedTransaction.deserialize(Buffer.from(serializedTransactionBase64, "base64"));

    const txid = await connection.sendTransaction(deserializedTx, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed"
    });

    Logger.log("Transaction sent:", txid);

    const confirmation = await connection.confirmTransaction({
        signature: txid,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight
    });

    if (!confirmation.value.err) {
        Logger.log("Success:", `https://fomo.fund/token/${mint.publicKey.toBase58()}`);
        const ata = getAssociatedTokenAddressSync(mint.publicKey, deployer.publicKey, allowOffCurve);
        const balance = await connection.getTokenAccountBalance(ata, "processed");
        const amount = balance.value.uiAmount;
        
        if (amount === null) {
            Logger.log(`${deployer.publicKey.toBase58()}:`, "No Account Found");
        } else {
            Logger.log(`${deployer.publicKey.toBase58()}:`, amount);
        }

        return {
            success: true,
            ca: mint.publicKey.toBase58(),
            creator: deployer.publicKey.toBase58(),
        };
    } else {
        Logger.log("Create and Buy failed");
        return {
            success: false,
            ca: mint.publicKey.toBase58(),
            error: confirmation.value.err || "Transaction failed",
        };
    }
};

const buyToken = async ({
    fomo,
    buyer,
    mint,
    amount,
    priorityFee,
    allowOffCurve,
    slippage,
    connection,
    currency,
    commitment
}: {
    fomo: Fomo;
    buyer: Keypair;
    mint: PublicKey;
    amount: number;
    priorityFee: number;
    allowOffCurve: boolean;
    slippage: number;
    connection: Connection;
    currency: PurchaseCurrency;
    commitment: string;
}) => {
    const buyVersionedTx = await fomo.buyToken(
        buyer.publicKey,
        mint,
        amount,
        slippage,
        priorityFee,
        currency
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    buyVersionedTx.message.recentBlockhash = blockhash;

    const serializedTransaction = buyVersionedTx.serialize();
    const serializedTransactionBase64 = Buffer.from(serializedTransaction).toString("base64");
    const deserializedTx = VersionedTransaction.deserialize(Buffer.from(serializedTransactionBase64, "base64"));

    const txid = await connection.sendTransaction(deserializedTx, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed"
    });

    Logger.log("Transaction sent:", txid);

    const confirmation = await connection.confirmTransaction({
        signature: txid,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight
    });

    if (!confirmation.value.err) {
        Logger.log("Success:", `https://fomo.fund/token/${mint.toBase58()}`);
        const ata = getAssociatedTokenAddressSync(mint, buyer.publicKey, allowOffCurve);
        const balance = await connection.getTokenAccountBalance(ata, "processed");
        const amount = balance.value.uiAmount;
        
        if (amount === null) {
            Logger.log(`${buyer.publicKey.toBase58()}:`, "No Account Found");
        } else {
            Logger.log(`${buyer.publicKey.toBase58()}:`, amount);
        }
    } else {
        Logger.log("Buy failed");
    }
};

const sellToken = async ({
    fomo,
    seller,
    mint,
    amount,
    priorityFee,
    slippage,
    allowOffCurve,
    connection,
    currency,
    commitment
}: {
    fomo: Fomo;
    seller: Keypair;
    mint: PublicKey;
    amount: number;
    priorityFee: number;
    slippage: number;
    allowOffCurve: boolean;
    connection: Connection;
    currency: PurchaseCurrency;
    commitment: string;
}) => {
    const sellVersionedTx = await fomo.sellToken(
        seller.publicKey,
        mint,
        amount,
        slippage,
        priorityFee,
        currency
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    sellVersionedTx.message.recentBlockhash = blockhash;

    const serializedTransaction = sellVersionedTx.serialize();
    const serializedTransactionBase64 = Buffer.from(serializedTransaction).toString("base64");
    const deserializedTx = VersionedTransaction.deserialize(Buffer.from(serializedTransactionBase64, "base64"));

    const txid = await connection.sendTransaction(deserializedTx, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed"
    });

    Logger.log("Transaction sent:", txid);

    const confirmation = await connection.confirmTransaction({
        signature: txid,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight
    });

    if (!confirmation.value.err) {
        Logger.log("Success:", `https://fomo.fund/token/${mint.toBase58()}`);
        const ata = getAssociatedTokenAddressSync(mint, seller.publicKey, allowOffCurve);
        const balance = await connection.getTokenAccountBalance(ata, "processed");
        const amount = balance.value.uiAmount;
        
        if (amount === null) {
            Logger.log(`${seller.publicKey.toBase58()}:`, "No Account Found");
        } else {
            Logger.log(`${seller.publicKey.toBase58()}:`, amount);
        }
    } else {
        Logger.log("Sell failed");
    }
};

const promptConfirmation = async (): Promise<boolean> => {
    return true;
};

// export default {
//     name: "PUMP_FUN",
//     description: "Create and buy a new token on Pump.fun",

//     async handler({
//         connection,
//         keypair,
//         tokenMetadata,
//         buyAmountSol,
//         requiredLiquidity = 85
//     }: {
//         connection: Connection;
//         keypair: Keypair;
//         tokenMetadata: CreateTokenMetadata;
//         buyAmountSol: number;
//         requiredLiquidity?: number;
//     }): Promise<any> {
//         try {
//             Logger.info("Starting Pump.fun token creation...");

//             // Generate mint keypair for the new token
//             const mintKeypair = Keypair.generate();
//             Logger.info(`Generated mint address: ${mintKeypair.publicKey.toBase58()}`);

//             // Create metadata URI using Pump.fun's API
//             const formData = new FormData();
//             formData.append("name", tokenMetadata.name);
//             formData.append("symbol", tokenMetadata.symbol);
//             formData.append("description", tokenMetadata.description);

//             const metadataResponse = await fetch("https://pump.fun/api/ipfs", {
//                 method: "POST",
//                 body: formData,
//             });

//             const metadataResponseJSON = await metadataResponse.json();
//             if (!metadataResponseJSON.metadataUri) {
//                 throw new Error("Failed to create token metadata");
//             }

//             // Convert SOL to lamports
//             const lamports = BigInt(Math.floor(buyAmountSol * 1e9));

//             // Get create token transaction from Pump.fun's API
//             const createTokenResponse = await fetch("https://pump.fun/api/create-token", {
//                 method: "POST",
//                 headers: {
//                     "Content-Type": "application/json",
//                 },
//                 body: JSON.stringify({
//                     creator: keypair.publicKey.toBase58(),
//                     name: tokenMetadata.name,
//                     symbol: tokenMetadata.symbol,
//                     metadataUri: metadataResponseJSON.metadataUri,
//                     mintKeypair: bs58.encode(mintKeypair.secretKey),
//                     requiredLiquidity,
//                     buyAmount: Number(lamports) / 1e9
//                 }),
//             });

//             const createTokenData = await createTokenResponse.json();
//             if (!createTokenData.transaction) {
//                 throw new Error("Failed to get create token transaction");
//             }

//             // Deserialize and sign transaction
//             const transactionBuf = Buffer.from(createTokenData.transaction, "base64");
//             const transaction = VersionedTransaction.deserialize(transactionBuf);
//             transaction.sign([keypair, mintKeypair]);

//             // Send and confirm transaction
//             const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            
//             const txid = await connection.sendTransaction(transaction, {
//                 skipPreflight: false,
//                 maxRetries: 3,
//                 preflightCommitment: "confirmed"
//             });

//             Logger.info("Transaction sent:", txid);

//             const confirmation = await connection.confirmTransaction({
//                 signature: txid,
//                 blockhash,
//                 lastValidBlockHeight
//             }, "confirmed");

//             if (confirmation.value.err) {
//                 throw new Error(`Transaction failed: ${confirmation.value.err}`);
//             }

//             Logger.info("Token creation completed successfully!");

//             // Get token balance
//             const ata = getAssociatedTokenAddressSync(
//                 mintKeypair.publicKey,
//                 keypair.publicKey,
//                 false
//             );
//             const balance = await connection.getTokenAccountBalance(ata);

//             return {
//                 success: true,
//                 txid,
//                 tokenAddress: mintKeypair.publicKey.toBase58(),
//                 creator: keypair.publicKey.toBase58(),
//                 name: tokenMetadata.name,
//                 symbol: tokenMetadata.symbol,
//                 balance: balance.value.uiAmount,
//                 pumpFunUrl: `https://pump.fun/token/${mintKeypair.publicKey.toBase58()}`
//             };

//         } catch (error: any) {
//             Logger.error("Error during Pump.fun token creation:", error);
//             return {
//                 success: false,
//                 error: error.message
//             };
//         }
//     },

//     examples: [
//         [
//             {
//                 user: "{{user1}}",
//                 content: {
//                     text: "Create a new token called GLITCHIZA with symbol GLITCHIZA and generate a description about it on fomo.fund. Also come up with a description for it to use for image generation .buy 0.00069 SOL worth.",
//                 },
//             },
//             {
//                 user: "{{user2}}",
//                 content: {
//                     text: "Token GLITCHIZA (GLITCHIZA) created successfully on fomo.fund!\nURL: https://fomo.fund/token/673247855e8012181f941f84\nCreator: Anonymous\nView at: https://fomo.fund/token/673247855e8012181f941f84",
//                     action: "CREATE_AND_BUY_TOKEN",
//                     content: {
//                         tokenInfo: {
//                             symbol: "GLITCHIZA",
//                             address:
//                                 "EugPwuZ8oUMWsYHeBGERWvELfLGFmA1taDtmY8uMeX6r",
//                             creator:
//                                 "9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa",
//                             name: "GLITCHIZA",
//                             description: "A GLITCHIZA token",
//                         },
//                     },
//                 },
//             },
//         ],
//     ] as ActionExample[][],
// } as Action;