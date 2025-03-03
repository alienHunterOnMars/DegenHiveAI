import { Client, Message, MessageReaction, User, TextChannel, EmbedBuilder } from "discord.js";
import { Logger, REDIS_CHANNELS, RedisClient } from "@hiveai/utils";
import { v4 as uuid } from 'uuid';


 

export class CommunityHandler {
    private client: Client;
    
 
    constructor(client: Client) {
        this.client = client;
    }

    async handleMessage(message: Message, redisClient: RedisClient): Promise<void> {
        try {
            // Publish the message to the Redis channel
            await this.publishMessage(message, redisClient);
        } catch (error) {
            Logger.error("Error handling community message:", error);
        }
    }

    async handleReaction(reaction: MessageReaction, user: User): Promise<void> {
        try {
            Logger.info(`Handling reaction from ${user.tag}`);
        } catch (error) {
            Logger.error("Error handling reaction:", error);
        }
    } 
  
 
 

    private async publishMessage(message: any, redisClient: RedisClient): Promise<void> {

        console.log(message);
        console.log(`message.id: ${message.id}`);
        console.log(`message.author.id: ${message.author.id}`);
        console.log(`message.author.username: ${message.author.username}`);
        console.log(`message.content: ${message.content}`);

        await redisClient.publish(REDIS_CHANNELS.INTERNAL, {
            id: uuid(),
            timestamp: Date.now(),
            type: 'INTERNAL',
            source: 'discord',
            destination: 'hivemind/ceo',
            payload: {
                messageId: message.id,
                byId: message.author.id,
                by: message.author.username,
                channelId: message.channelId,
                content: message.content
            }
        });
    }
} 