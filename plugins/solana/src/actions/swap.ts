import { Logger } from "@hiveai/utils";
import { Connection, type Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import BigNumber from "bignumber.js";
import { getTokenDecimals } from "./swapUtils";

export interface SwapParams {
    connection: Connection;
    keypair: Keypair;
    inputToken: string;
    outputToken: string;
    amount: number;
    slippage?: number;
}

export const executeSwap = {
    name: "EXECUTE_SWAP",
    description: "Swap tokens using Jupiter Exchange",

    async handler({
        connection,
        keypair,
        inputToken,
        outputToken,
        amount,
        slippage = 1
    }: SwapParams): Promise<any> {
        try {
            Logger.info("Starting token swap...");
            
            // Get the decimals for the input token
            const decimals = inputToken === "So11111111111111111111111111111111111111112" 
                ? new BigNumber(9)
                : new BigNumber(await getTokenDecimals(connection, inputToken));

            Logger.info("Token decimals:", decimals.toString());

            // Calculate adjusted amount with decimals
            const amountBN = new BigNumber(amount);
            const adjustedAmount = amountBN.multipliedBy(new BigNumber(10).pow(decimals));

            Logger.info("Fetching quote with params:", {
                inputMint: inputToken,
                outputMint: outputToken,
                amount: adjustedAmount.toString()
            });

            // Get quote from Jupiter
            const quoteResponse = await fetch(
                `https://quote-api.jup.ag/v6/quote?inputMint=${inputToken}&outputMint=${outputToken}&amount=${adjustedAmount}&dynamicSlippage=true&maxAccounts=64`
            );
            const quoteData = await quoteResponse.json();

            if (!quoteData || quoteData.error) {
                throw new Error(`Failed to get quote: ${quoteData?.error || "Unknown error"}`);
            }

            Logger.info("Quote received:", quoteData);

            // Prepare swap transaction
            const swapRequestBody = {
                quoteResponse: quoteData,
                userPublicKey: keypair.publicKey.toBase58(),
                dynamicComputeUnitLimit: true,
                dynamicSlippage: true,
                priorityLevelWithMaxLamports: {
                    maxLamports: 4000000,
                    priorityLevel: "veryHigh",
                }
            };

            Logger.info("Requesting swap transaction...");

            const swapResponse = await fetch("https://quote-api.jup.ag/v6/swap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(swapRequestBody)
            });

            const swapData = await swapResponse.json();

            if (!swapData || !swapData.swapTransaction) {
                throw new Error(`Failed to get swap transaction: ${swapData?.error || "No swap transaction returned"}`);
            }

            // Deserialize and sign transaction
            const transactionBuf = Buffer.from(swapData.swapTransaction, "base64");
            const transaction = VersionedTransaction.deserialize(transactionBuf);
            transaction.sign([keypair]);

            // Send and confirm transaction
            const latestBlockhash = await connection.getLatestBlockhash();
            
            const txid = await connection.sendTransaction(transaction, {
                skipPreflight: false,
                maxRetries: 3,
                preflightCommitment: "confirmed"
            });

            Logger.info("Transaction sent:", txid);

            const confirmation = await connection.confirmTransaction({
                signature: txid,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            }, "confirmed");

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }

            Logger.info("Swap completed successfully!");

            return {
                success: true,
                txid,
                inputToken,
                outputToken,
                amount: amount.toString(),
                quote: quoteData
            };

        } catch (error: any) {
            Logger.error("Error during token swap:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};