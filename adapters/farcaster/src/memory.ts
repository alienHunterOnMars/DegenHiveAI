import {
    // getEmbeddingZeroVector,
    type IAgentRuntime,
    // stringToUuid,
    // type Memory,
    type UUID,
} from "@hiveai/core";
import { Logger } from "@hiveai/utils";
import type { Cast } from "./types";
import { toHex } from "viem";
import { castUuid } from "./utils";
import type { FarcasterClient } from "./client";

export function createCastMemory({
    roomId,
    senderId,
    runtime,
    cast,
}: {
    roomId: UUID;
    senderId: UUID;
    runtime: any;
    cast: Cast;
}): any {
    const inReplyTo = cast.inReplyTo
        ? castUuid({
              hash: toHex(cast.inReplyTo.hash),
              agentId: runtime.agentId,
          })
        : undefined;

    return {
        id: castUuid({
            hash: cast.hash,
            agentId: runtime.agentId,
        }),
        agentId: runtime.agentId,
        userId: senderId,
        content: {
            text: cast.text,
            source: "farcaster",
            url: "",
            inReplyTo,
            hash: cast.hash,
        },
        roomId,
        embedding: null, // getEmbeddingZeroVector(),
    };
}

export async function buildConversationThread({
    cast,
    runtime,
    client,
}: {
    cast: Cast;
    runtime: any;
    client: FarcasterClient;
}): Promise<Cast[]> {
    const thread: Cast[] = [];
    const visited: Set<string> = new Set();
    async function processThread(currentCast: Cast) {
        if (visited.has(currentCast.hash)) {
            return;
        }

        visited.add(currentCast.hash);

        const roomId = castUuid({
            hash: currentCast.hash,
            agentId: runtime.agentId,
        });

        // Check if the current cast has already been saved
        const memory = await runtime.messageManager.getMemoryById(roomId);

        if (!memory) {
            Logger.log("Creating memory for cast", currentCast.hash);

            const userId = ""; // stringToUuid(currentCast.authorFid.toString());

            await runtime.ensureConnection(
                userId,
                roomId,
                currentCast.profile.username,
                currentCast.profile.name,
                "farcaster"
            );

            await runtime.messageManager.createMemory(
                createCastMemory({
                    roomId,
                    senderId: userId,
                    runtime,
                    cast: currentCast,
                })
            );
        }

        thread.unshift(currentCast);

        if (currentCast.inReplyTo) {
            const parentCast = await client.getCast(currentCast.inReplyTo.hash);
            await processThread(parentCast);
        }
    }

    await processThread(cast);
    return thread;
}
