import { Logger } from "@hiveai/utils";
import type { FarcasterClient } from "./client";
import { formatTimeline, postTemplate } from "./prompts";
import { castUuid, MAX_CAST_LENGTH } from "./utils";
import { createCastMemory } from "./memory";
import { sendCast } from "./actions";

export class FarcasterPostManager {
    client: FarcasterClient;
    runtime: any;
    fid: any;
    isDryRun: any;
    private timeout: NodeJS.Timeout | undefined;

    constructor(
        client: FarcasterClient,
        runtime: any,
        private signerUuid: string,
        public cache: Map<string, any>
    ) {
        this.client = client;
        this.runtime = runtime;

        this.fid = this.client.farcasterConfig?.FARCASTER_FID ?? 0;
        this.isDryRun = this.client.farcasterConfig?.FARCASTER_DRY_RUN ?? false;

        // Log configuration on initialization
        Logger.log("Farcaster Client Configuration:");
        Logger.log(`- FID: ${this.fid}`);
        Logger.log(
            `- Dry Run Mode: ${this.isDryRun ? "enabled" : "disabled"}`
        );
        Logger.log(
            `- Enable Post: ${this.client.farcasterConfig.ENABLE_POST ? "enabled" : "disabled"}`
        );
        if (this.client.farcasterConfig.ENABLE_POST) {
            Logger.log(
                `- Post Interval: ${this.client.farcasterConfig.POST_INTERVAL_MIN}-${this.client.farcasterConfig.POST_INTERVAL_MAX} minutes`
            );
            Logger.log(
                `- Post Immediately: ${this.client.farcasterConfig.POST_IMMEDIATELY ? "enabled" : "disabled"}`
            );
        }
        Logger.log(
            `- Action Processing: ${this.client.farcasterConfig.ENABLE_ACTION_PROCESSING ? "enabled" : "disabled"}`
        );
        Logger.log(
            `- Action Interval: ${this.client.farcasterConfig.ACTION_INTERVAL} minutes`
        );

        if (this.isDryRun) {
            Logger.log(
                "Farcaster client initialized in dry run mode - no actual casts should be posted"
            );
        }
    }

    public async start() {
        const generateNewCastLoop = async () => {

            const lastPost = await this.runtime.cacheManager.get("farcaster/" + this.fid + "/lastPost");

            const lastPostTimestamp = lastPost?.timestamp ?? 0;
            const minMinutes = Number(this.client.farcasterConfig.POST_INTERVAL_MIN);
            const maxMinutes = Number(this.client.farcasterConfig.POST_INTERVAL_MAX);
            const randomMinutes =
                Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) +
                minMinutes;
            const delay = randomMinutes * 60 * 1000;

            if (Date.now() > lastPostTimestamp + delay) {
                try {
                    await this.generateNewCast();
                } catch (error) {
                    Logger.error(error);
                    return;
                }
            }

            this.timeout = setTimeout(() => {
                generateNewCastLoop(); // Set up next iteration
            }, delay);

            Logger.log(`Next cast scheduled in ${randomMinutes} minutes`);
        };

        if (this.client.farcasterConfig.ENABLE_POST) {
            if (this.client.farcasterConfig.POST_IMMEDIATELY) {
                await this.generateNewCast();
            }
            generateNewCastLoop();
        }
    }

    public async stop() {
        if (this.timeout) clearTimeout(this.timeout);
    }

    private async generateNewCast() {
        // Logger.info("Generating new cast");
        // try {
        //     const profile = await this.client.getProfile(this.fid);
        //     await this.runtime.ensureUserExists(
        //         this.runtime.agentId,
        //         profile.username,
        //         this.runtime.character.name,
        //         "farcaster"
        //     );

        //     const { timeline } = await this.client.getTimeline({
        //         fid: this.fid,
        //         pageSize: 10,
        //     });

        //     this.cache.set("farcaster/timeline", timeline);

        //     const formattedHomeTimeline = formatTimeline(
        //         this.runtime.character,
        //         timeline
        //     );

        //     const generateRoomId = stringToUuid("farcaster_generate_room");

        //     const state = await this.runtime.composeState(
        //         {
        //             roomId: generateRoomId,
        //             userId: this.runtime.agentId,
        //             agentId: this.runtime.agentId,
        //             content: { text: "", action: "" },
        //         },
        //         {
        //             farcasterUserName: profile.username,
        //             timeline: formattedHomeTimeline,
        //         }
        //     );

        //     // Generate new cast
        //     const context = composeContext({
        //         state,
        //         template:
        //             this.runtime.character.templates?.farcasterPostTemplate ||
        //             postTemplate,
        //     });

        //     const newContent = await generateText({
        //         runtime: this.runtime,
        //         context,
        //         modelClass: ModelClass.SMALL,
        //     });

        //     const slice = newContent.replaceAll(/\\n/g, "\n").trim();

        //     let content = slice.slice(0, MAX_CAST_LENGTH);

        //     // if it's bigger than the max limit, delete the last line
        //     if (content.length > MAX_CAST_LENGTH) {
        //         content = content.slice(0, content.lastIndexOf("\n"));
        //     }

        //     if (content.length > MAX_CAST_LENGTH) {
        //         // slice at the last period
        //         content = content.slice(0, content.lastIndexOf("."));
        //     }

        //     // if it's still too long, get the period before the last period
        //     if (content.length > MAX_CAST_LENGTH) {
        //         content = content.slice(0, content.lastIndexOf("."));
        //     }

        //     if (this.runtime.getSetting("FARCASTER_DRY_RUN") === "true") {
        //         Logger.info(`Dry run: would have cast: ${content}`);
        //         return;
        //     }

        //     try {
        //         const [{ cast }] = await sendCast({
        //             client: this.client,
        //             runtime: this.runtime,
        //             signerUuid: this.signerUuid,
        //             roomId: generateRoomId,
        //             content: { text: content },
        //             profile,
        //         });

        //         await this.runtime.cacheManager.set(
        //             `farcaster/${this.fid}/lastCast`,
        //             {
        //                 hash: cast.hash,
        //                 timestamp: Date.now(),
        //             }
        //         );

        //         const roomId = castUuid({
        //             agentId: this.runtime.agentId,
        //             hash: cast.hash,
        //         });

        //         await this.runtime.ensureRoomExists(roomId);

        //         await this.runtime.ensureParticipantInRoom(
        //             this.runtime.agentId,
        //             roomId
        //         );

        //         Logger.info(
        //             `[Farcaster Neynar Client] Published cast ${cast.hash}`
        //         );

        //         await this.runtime.messageManager.createMemory(
        //             createCastMemory({
        //                 roomId,
        //                 senderId: this.runtime.agentId,
        //                 runtime: this.runtime,
        //                 cast,
        //             })
        //         );
        //     } catch (error) {
        //         Logger.error("Error sending cast:", error);
        //     }
        // } catch (error) {
        //     Logger.error("Error generating new cast:", error);
        // }
    }
}
