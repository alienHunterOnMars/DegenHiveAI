import { Logger } from "@hiveai/utils";
import { Connection, type Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

interface TransferSolParams {
    connection: Connection;
    keypair: Keypair;
    recipient: string;
    amount: number;
}

export default {
    name: "TRANSFER_SOL",
    description: "Transfer native SOL from one address to another",

    async handler({
        connection,
        keypair,
        recipient,
        amount
    }: TransferSolParams): Promise<any> {
        try {
            Logger.info("Starting SOL transfer...");
            
            const recipientPubkey = new PublicKey(recipient);

            // Convert SOL to lamports (1 SOL = 1e9 lamports)
            const lamports = amount * 1e9;

            // Create transfer instruction
            const instruction = SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: recipientPubkey,
                lamports,
            });

            // Create and sign transaction
            const messageV0 = new TransactionMessage({
                payerKey: keypair.publicKey,
                recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
                instructions: [instruction],
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

            Logger.info("SOL transfer completed successfully!");

            return {
                success: true,
                signature,
                amount: amount.toString(),
                recipient
            };

        } catch (error: any) {
            Logger.error("Error during SOL transfer:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};