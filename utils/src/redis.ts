// src/infrastructure/RedisClient.ts
import Redis from 'ioredis';
import { Logger } from '@hiveai/utils';
import { EventEmitter } from 'events';

/// ** type
/// INTERNAL: Internal messages for internal use only
/// INTERACTION: Messages from users (tg, discord, reddit, farcaster, twitter) to the system
/// TRANSACTION: Messages to execute transactions (via tg) 
/// NOTIFICATION: Messages from the system to the user
/// ALERT: Messages from the system to the user 
/// TELEGRAM: Messages to the Telegram adapter from the system
/// DISCORD: Messages to the Discord adapter from the system
/// REDDIT: Messages to the Reddit adapter from the system
/// FARCASTER: Messages to the Farcaster adapter from the system
/// TWITTER: Messages to the Twitter adapter from the system

export interface RedisMessage {
  id: string;
  timestamp: number;
  type: 'INTERNAL' | 'INTERACTION' | 'TRANSACTION' | 'NOTIFICATION' | 'ALERT' | 'TELEGRAM' | 'DISCORD' | 'REDDIT' | 'FARCASTER' | 'TWITTER';
  source: string;
  destination: string;
  payload: any;
}






export const REDIS_CHANNELS = {
  INTERNAL: 'INTERNAL',
  SOCIAL_INBOUND: 'social:inbound',
  SOCIAL_OUTBOUND: 'social:outbound', 
  TRANSACTIONS: 'transactions:requests',
  TRANSACTION_STATUS: 'transactions:status',
  NOTIFICATIONS: 'notifications',
  ALERTS: 'alerts',
  TELEGRAM: 'TELEGRAM',
  DISCORD: 'DISCORD',
  REDDIT: 'REDDIT',
  FARCASTER: 'FARCASTER',
  TWITTER: 'TWITTER',
  EMAIL: 'EMAIL'
};

export class RedisClient extends EventEmitter {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;
  private isConnected: boolean = false;

  constructor(config: { url: string }) {
    super();
    this.client = new Redis(config.url);
    this.subscriber = new Redis(config.url);
    this.publisher = new Redis(config.url);

    // Handle connection events
    this.client.on('connect', () => {
      this.isConnected = true;
      Logger.info('Redis client connected');
    });

    this.client.on('error', (error) => {
      Logger.error('Redis client error:', error);
      this.emit('error', error);
    });
  }

  async publish(channel: string, message: RedisMessage): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client not connected');
      }
      await this.publisher.publish(channel, JSON.stringify(message));
      Logger.debug(`Published message to ${channel}:`, message);
    } catch (error) {
      Logger.error(`Redis publish error: ${error}`);
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: RedisMessage) => Promise<void>): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      Logger.info(`Subscribed to channel: ${channel}`);

      this.subscriber.on('message', async (chan, message) => {
        console.log('chan', chan);
        console.log('message', message);
        if (chan === channel) {
          try {
            const parsedMessage = JSON.parse(message) as RedisMessage;
            await callback(parsedMessage);
          } catch (error) {
            Logger.error(`Error processing message from ${channel}:`, error);
          }
        }
      });
    } catch (error) {
      Logger.error(`Redis subscribe error: ${error}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.quit(),
      this.subscriber.quit(),
      this.publisher.quit()
    ]);
    this.isConnected = false;
    Logger.info('Redis client disconnected');
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch {
      return false;
    }
  }
}