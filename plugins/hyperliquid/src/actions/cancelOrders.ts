import {
    type Action,
    type ActionExample,
    type Memory,
    type State,
    type HandlerCallback,
    Logger,
} from "@hiveai/utils";
import { Hyperliquid } from "hyperliquid";

export const cancelOrders: Action = {
    name: "CANCEL_ORDERS",
    similes: ["CANCEL_ALL_ORDERS", "CANCEL", "CANCEL_ALL"],
    description: "Cancel all open orders on Hyperliquid",
    validate: async (runtime: any) => {
        return !!runtime.getSetting("HYPERLIQUID_PRIVATE_KEY");
    },
    handler: async (
        runtime: any,
        message: Memory,
        state?: State,
        options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        try {
            // Initialize SDK
            const sdk = new Hyperliquid({
                privateKey: runtime.getSetting("HYPERLIQUID_PRIVATE_KEY"),
                testnet: runtime.getSetting("HYPERLIQUID_TESTNET") === "true",
                enableWs: false,
            });
            await sdk.connect();

            Logger.info("Cancelling all open orders...");
            const result = await sdk.custom.cancelAllOrders();
            Logger.info("Cancel result:", result);

            if (callback) {
                const cancelledCount =
                    result?.response?.data?.statuses?.length || 0;
                callback({
                    text:
                        cancelledCount > 0
                            ? `Successfully cancelled ${cancelledCount} open order${cancelledCount > 1 ? "s" : ""}`
                            : "No open orders to cancel",
                    content: result,
                });
            }

            return true;
        } catch (error: any) {
            Logger.error("Error cancelling orders:", error);
            if (callback) {
                callback({
                    text: `Error cancelling orders: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Cancel all my orders",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll cancel all your open orders.",
                    action: "CANCEL_ORDERS",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Successfully cancelled 2 open orders",
                },
            },
        ],
    ] as ActionExample[][],
};

export default cancelOrders;
