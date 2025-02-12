import { z } from "zod";

export const solanaEnvSchema = z
    .object({
        WALLET_SECRET_SALT: z.string().optional(),
    })
    .and(
        z.union([
            z.object({
                WALLET_SECRET_KEY: z
                    .string()
                    .min(1, "Wallet secret key is required"),
                WALLET_PUBLIC_KEY: z
                    .string()
                    .min(1, "Wallet public key is required"),
            }),
            z.object({
                WALLET_SECRET_SALT: z
                    .string()
                    .min(1, "Wallet secret salt is required"),
            }),
        ])
    )
    .and(
        z.object({
            SOL_ADDRESS: z.string().min(1, "SOL address is required"),
            SLIPPAGE: z.string().min(1, "Slippage is required"),
            SOLANA_RPC_URL: z.string().min(1, "RPC URL is required"),
            HELIUS_API_KEY: z.string().min(1, "Helius API key is required"),
            BIRDEYE_API_KEY: z.string().min(1, "Birdeye API key is required"),
        })
    );

export type SolanaConfig = z.infer<typeof solanaEnvSchema>;

 