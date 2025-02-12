import { Logger } from "@hiveai/utils";
import {
    Connection,
    Keypair,
    type PublicKey,
    VersionedTransaction,
} from "@solana/web3.js";
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

interface TokenMetadata {
    name: string;
    symbol: string;
    description: string;
    image_description: string;
    uri: string;
}

interface FomoParams {
    connection: Connection;
    keypair: Keypair;
    tokenMetadata: TokenMetadata;
    buyAmountSol: number;
    requiredLiquidity?: number;
}

export interface CreateAndBuyContent extends Content {
    tokenMetadata: {
        name: string;
        symbol: string;
        description: string;
        image_description: string;
    };
    buyAmountSol: string | number;
    requiredLiquidity: string | number;
}

export function isCreateAndBuyContentForFomo(
    content: any
): content is CreateAndBuyContent {
    Logger.log("Content for create & buy", content);
    return (
        typeof content.tokenMetadata === "object" &&
        content.tokenMetadata !== null &&
        typeof content.tokenMetadata.name === "string" &&
        typeof content.tokenMetadata.symbol === "string" &&
        typeof content.tokenMetadata.description === "string" &&
        typeof content.tokenMetadata.image_description === "string" &&
        (typeof content.buyAmountSol === "string" ||
            typeof content.buyAmountSol === "number") &&
        typeof content.requiredLiquidity === "number"
    );
}

export const createAndBuyToken = async ({
    deployer,
    mint,
    tokenMetadata,
    buyAmountSol,
    priorityFee,
    requiredLiquidity = 85,
    allowOffCurve,
    commitment = "confirmed",
    fomo,
    connection,
}: {
    deployer: Keypair;
    mint: Keypair;
    tokenMetadata: TokenMetadata;
    buyAmountSol: bigint;
    priorityFee: number;
    requiredLiquidity: number;
    allowOffCurve: boolean;
    commitment?:
        | "processed"
        | "confirmed"
        | "finalized"
        | "recent"
        | "single"
        | "singleGossip"
        | "root"
        | "max";
    fomo: Fomo;
    connection: Connection;
    slippage: string;
}) => {
    const { transaction: versionedTx } = await fomo.createToken(
        deployer.publicKey,
        tokenMetadata.name,
        tokenMetadata.symbol,
        tokenMetadata.uri,
        priorityFee,
        bs58.encode(mint.secretKey),
        requiredLiquidity,
        Number(buyAmountSol) / 10 ** 9
    );

    const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
    versionedTx.message.recentBlockhash = blockhash;
    versionedTx.sign([mint]);

    const serializedTransaction = versionedTx.serialize();
    const serializedTransactionBase64 = Buffer.from(
        serializedTransaction
    ).toString("base64");

    const deserializedTx = VersionedTransaction.deserialize(
        Buffer.from(serializedTransactionBase64, "base64")
    );

    const txid = await connection.sendTransaction(deserializedTx, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
    });

    Logger.log("Transaction sent:", txid);

    // Confirm transaction using the blockhash
    const confirmation = await connection.confirmTransaction(
        {
            signature: txid,
            blockhash: blockhash,
            lastValidBlockHeight: lastValidBlockHeight,
        },
        commitment
    );

    if (!confirmation.value.err) {
        Logger.log(
            "Success:",
            `https://fomo.fund/token/${mint.publicKey.toBase58()}`
        );
        const ata = getAssociatedTokenAddressSync(
            mint.publicKey,
            deployer.publicKey,
            allowOffCurve
        );
        const balance = await connection.getTokenAccountBalance(
            ata,
            "processed"
        );
        const amount = balance.value.uiAmount;
        if (amount === null) {
            Logger.log(
                `${deployer.publicKey.toBase58()}:`,
                "No Account Found"
            );
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

export const buyToken = async ({
    fomo,
    buyer,
    mint,
    amount,
    priorityFee,
    allowOffCurve,
    slippage,
    connection,
    currency = "sol",
    commitment = "confirmed",
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
    commitment?:
        | "processed"
        | "confirmed"
        | "finalized"
        | "recent"
        | "single"
        | "singleGossip"
        | "root"
        | "max";
}) => {
    const buyVersionedTx = await fomo.buyToken(
        buyer.publicKey,
        mint,
        amount,
        slippage,
        priorityFee,
        currency || "sol"
    );

    const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
    buyVersionedTx.message.recentBlockhash = blockhash;

    const serializedTransaction = buyVersionedTx.serialize();
    const serializedTransactionBase64 = Buffer.from(
        serializedTransaction
    ).toString("base64");

    const deserializedTx = VersionedTransaction.deserialize(
        Buffer.from(serializedTransactionBase64, "base64")
    );

    const txid = await connection.sendTransaction(deserializedTx, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
    });

    Logger.log("Transaction sent:", txid);

    // Confirm transaction using the blockhash
    const confirmation = await connection.confirmTransaction(
        {
            signature: txid,
            blockhash: blockhash,
            lastValidBlockHeight: lastValidBlockHeight,
        },
        commitment
    );

    if (!confirmation.value.err) {
        Logger.log(
            "Success:",
            `https://fomo.fund/token/${mint.toBase58()}`
        );
        const ata = getAssociatedTokenAddressSync(
            mint,
            buyer.publicKey,
            allowOffCurve
        );
        const balance = await connection.getTokenAccountBalance(
            ata,
            "processed"
        );
        const amount = balance.value.uiAmount;
        if (amount === null) {
            Logger.log(
                `${buyer.publicKey.toBase58()}:`,
                "No Account Found"
            );
        } else {
            Logger.log(`${buyer.publicKey.toBase58()}:`, amount);
        }
    } else {
        Logger.log("Buy failed");
    }
};

export const sellToken = async ({
    fomo,
    seller,
    mint,
    amount,
    priorityFee,
    allowOffCurve,
    slippage,
    connection,
    currency = "token",
    commitment = "confirmed",
}: {
    fomo: Fomo;
    seller: Keypair;
    mint: PublicKey;
    amount: number;
    priorityFee: number;
    allowOffCurve: boolean;
    slippage: number;
    connection: Connection;
    currency: PurchaseCurrency;
    commitment?:
        | "processed"
        | "confirmed"
        | "finalized"
        | "recent"
        | "single"
        | "singleGossip"
        | "root"
        | "max";
}) => {
    const sellVersionedTx = await fomo.sellToken(
        seller.publicKey,
        mint,
        amount,
        slippage,
        priorityFee,
        currency || "token"
    );

    const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
    sellVersionedTx.message.recentBlockhash = blockhash;

    const serializedTransaction = sellVersionedTx.serialize();
    const serializedTransactionBase64 = Buffer.from(
        serializedTransaction
    ).toString("base64");

    const deserializedTx = VersionedTransaction.deserialize(
        Buffer.from(serializedTransactionBase64, "base64")
    );

    const txid = await connection.sendTransaction(deserializedTx, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
    });

    Logger.log("Transaction sent:", txid);

    // Confirm transaction using the blockhash
    const confirmation = await connection.confirmTransaction(
        {
            signature: txid,
            blockhash: blockhash,
            lastValidBlockHeight: lastValidBlockHeight,
        },
        commitment
    );

    if (!confirmation.value.err) {
        Logger.log(
            "Success:",
            `https://fomo.fund/token/${mint.toBase58()}`
        );
        const ata = getAssociatedTokenAddressSync(
            mint,
            seller.publicKey,
            allowOffCurve
        );
        const balance = await connection.getTokenAccountBalance(
            ata,
            "processed"
        );
        const amount = balance.value.uiAmount;
        if (amount === null) {
            Logger.log(
                `${seller.publicKey.toBase58()}:`,
                "No Account Found"
            );
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

const fomoTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "tokenMetadata": {
        "name": "Test Token",
        "symbol": "TEST",
        "description": "A test token",
        "image_description": "create an image of a rabbit"
    },
    "buyAmountSol": "0.00069",
    "requiredLiquidity": "85"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract or generate (come up with if not included) the following information about the requested token creation:
- Token name
- Token symbol
- Token description
- Token image description
- Amount of SOL to buy

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "FOMO",
    description: "Create and buy a new token on FOMO",
    similes: ["CREATE_AND_BUY_TOKEN", "DEPLOY_AND_BUY_TOKEN"],
    validate: async (_runtime: any, _message: any) => true,

    async handler({
        connection,
        keypair,
        tokenMetadata,
        buyAmountSol,
        requiredLiquidity = 85
    }: FomoParams): Promise<any> {
        try {
            Logger.info("Starting FOMO token creation...");

            // Initialize FOMO SDK with mainnet cluster
            const fomo = new Fomo(connection, "mainnet-beta", keypair);

            // Generate mint keypair for the new token
            const mintKeypair = Keypair.generate();
            Logger.info(`Generated mint address: ${mintKeypair.publicKey.toBase58()}`);

            // Create metadata URI using FOMO's API
            const formData = new FormData();
            formData.append("name", tokenMetadata.name);
            formData.append("symbol", tokenMetadata.symbol);
            formData.append("description", tokenMetadata.description);

            const metadataResponse = await fetch("https://fomo.fund/api/ipfs", {
                method: "POST",
                body: formData,
            });

            const metadataResponseJSON = await metadataResponse.json();
            if (!metadataResponseJSON.metadataUri) {
                throw new Error("Failed to create token metadata");
            }

            // Convert SOL to lamports
            const lamports = BigInt(Math.floor(buyAmountSol * 1e9));

            // Get transaction from FOMO SDK
            const { transaction: versionedTx } = await fomo.createToken(
                keypair.publicKey,
                tokenMetadata.name,
                tokenMetadata.symbol,
                metadataResponseJSON.metadataUri,
                100_000, // priority fee
                bs58.encode(mintKeypair.secretKey),
                requiredLiquidity,
                Number(lamports) / 1e9
            );

            // Get latest blockhash
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            versionedTx.message.recentBlockhash = blockhash;

            // Sign transaction with mint keypair
            versionedTx.sign([mintKeypair]);

            // Send transaction
            const txid = await connection.sendTransaction(versionedTx, {
                skipPreflight: false,
                maxRetries: 3,
                preflightCommitment: "confirmed"
            });

            Logger.info("Transaction sent:", txid);

            // Confirm transaction
            const confirmation = await connection.confirmTransaction({
                signature: txid,
                blockhash,
                lastValidBlockHeight
            }, "confirmed");

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }

            Logger.info("Token creation completed successfully!");

            // Get token balance
            const ata = getAssociatedTokenAddressSync(
                mintKeypair.publicKey,
                keypair.publicKey,
                false
            );
            const balance = await connection.getTokenAccountBalance(ata);

            return {
                success: true,
                txid,
                tokenAddress: mintKeypair.publicKey.toBase58(),
                creator: keypair.publicKey.toBase58(),
                name: tokenMetadata.name,
                symbol: tokenMetadata.symbol,
                balance: balance.value.uiAmount,
                fomoUrl: `https://fomo.fund/token/${mintKeypair.publicKey.toBase58()}`
            };

        } catch (error: any) {
            Logger.error("Error during FOMO token creation:", error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create a new token called GLITCHIZA with symbol GLITCHIZA and generate a description about it on fomo.fund. Also come up with a description for it to use for image generation .buy 0.00069 SOL worth.",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Token GLITCHIZA (GLITCHIZA) created successfully on fomo.fund!\nURL: https://fomo.fund/token/673247855e8012181f941f84\nCreator: Anonymous\nView at: https://fomo.fund/token/673247855e8012181f941f84",
                    action: "CREATE_AND_BUY_TOKEN",
                    content: {
                        tokenInfo: {
                            symbol: "GLITCHIZA",
                            address:
                                "EugPwuZ8oUMWsYHeBGERWvELfLGFmA1taDtmY8uMeX6r",
                            creator:
                                "9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa",
                            name: "GLITCHIZA",
                            description: "A GLITCHIZA token",
                        },
                    },
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
