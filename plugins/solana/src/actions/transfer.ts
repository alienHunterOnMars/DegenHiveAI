import { Logger } from "@hiveai/utils";
import { Connection, type Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferInstruction, createAssociatedTokenAccountInstruction } from "@solana/spl-token";

export interface TransferParams {
    connection: Connection;
    keypair: Keypair;
    recipient: string;
    tokenAddress: string;
    amount: number;
}

export default {
    name: "TRANSFER_TOKEN",
    description: "Transfer SPL tokens from one address to another",

    async handler({
        connection,
        keypair,
        recipient,
        tokenAddress,
        amount
    }: TransferParams): Promise<any> {
        try {
            Logger.info("Starting token transfer...");
            
            const mintPubkey = new PublicKey(tokenAddress);
            const recipientPubkey = new PublicKey(recipient);

            // Get token decimals and adjust amount
            const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
            const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 9;
            const adjustedAmount = BigInt(Number(amount) * Math.pow(10, decimals));

            // Get token accounts
            const senderATA = getAssociatedTokenAddressSync(mintPubkey, keypair.publicKey);
            const recipientATA = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey);

            const instructions = [];

            // Create recipient ATA if it doesn't exist
            const recipientATAInfo = await connection.getAccountInfo(recipientATA);
            if (!recipientATAInfo) {
                instructions.push(
                    createAssociatedTokenAccountInstruction(
                        keypair.publicKey,
                        recipientATA,
                        recipientPubkey,
                        mintPubkey
                    )
                );
            }

            // Add transfer instruction
            instructions.push(
                createTransferInstruction(
                    senderATA,
                    recipientATA,
                    keypair.publicKey,
                    adjustedAmount
                )
            );

            // Create and sign transaction
            const messageV0 = new TransactionMessage({
                payerKey: keypair.publicKey,
                recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
                instructions,
            }).compileToV0Message();

            const transaction = new VersionedTransaction(messageV0);
            transaction.sign([keypair]);

            // Send and confirm transaction
            const signature = await connection.sendTransaction(transaction, {
                skipPreflight: false,
                maxRetries: 3,
                preflightCommitment: "confirmed"
            });

            Logger.info("Transaction sent:", signature);

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            const confirmation = await connection.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight
            }, "confirmed");

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }

            Logger.info("Transfer completed successfully!");

            return {
                success: true,
                signature,
                amount: amount.toString(),
                recipient,
                tokenAddress
            };

        } catch (error: any) {
            Logger.error("Error during token transfer:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};