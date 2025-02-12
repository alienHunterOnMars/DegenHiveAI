import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { Logger } from "@hiveai/utils";
 
/**
 * Gets a keypair based on the private key
 * @param privateKey The private key
 * @returns Keypair
 */
export async function getWalletKey(
    privateKey: string
): Promise<Keypair> {
    try {
        const secretKey = bs58.decode(privateKey);
        return Keypair.fromSecretKey(secretKey);
    } catch (e) {
        Logger.log("Error decoding base58 private key:", e);
        try {
            Logger.log("Try decoding base64 instead");
            const secretKey = Uint8Array.from( Buffer.from(privateKey, "base64") );
            return Keypair.fromSecretKey(secretKey);
        } catch (e2) {
            Logger.error("Error decoding private key: ", e2);
            throw new Error("Invalid private key format");
        }
    }
}
