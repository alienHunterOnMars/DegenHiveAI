// import Redis from 'ioredis';
// import { Logger } from '@hiveai/utils';

// export interface RedisConfig {
//     host: string;
//     port: number;
//     password?: string;
//     db?: number;
//     keyPrefix?: string;
//     retryStrategy?: (times: number) => number | void;
// }

// export class RedisClient {
//     private client: Redis;
//     private isConnected: boolean = false;

//     constructor(config: RedisConfig) {
//         this.client = new Redis({
//             host: config.host,
//             port: config.port,
//             password: config.password,
//             db: config.db || 0,
//             keyPrefix: config.keyPrefix,
//             retryStrategy: config.retryStrategy || ((times) => {
//                 const delay = Math.min(times * 50, 2000);
//                 return delay;
//             }),
//             maxRetriesPerRequest: 3
//         });

//         this.setupEventHandlers();
//     }

//     private setupEventHandlers(): void {
//         this.client.on('connect', () => {
//             this.isConnected = true;
//             Logger.info('Redis: Connected');
//         });

//         this.client.on('error', (error) => {
//             Logger.error('Redis: Error:', error);
//         });

//         this.client.on('close', () => {
//             this.isConnected = false;
//             Logger.warn('Redis: Connection closed');
//         });
//     }

//     async set(key: string, value: string | number | Buffer, ttl?: number): Promise<void> {
//         if (ttl) {
//             await this.client.set(key, value, 'EX', ttl);
//         } else {
//             await this.client.set(key, value);
//         }
//     }

//     async get(key: string): Promise<string | null> {
//         return this.client.get(key);
//     }

//     async del(key: string): Promise<void> {
//         await this.client.del(key);
//     }

//     async hSet(key: string, field: string | object, value?: any): Promise<void> {
//         if (typeof field === 'object') {
//             await this.client.hmset(key, field);
//         } else {
//             await this.client.hset(key, field, value);
//         }
//     }

//     async hGet(key: string, field: string): Promise<string | null> {
//         return this.client.hget(key, field);
//     }

//     async hGetAll(key: string): Promise<Record<string, string>> {
//         return this.client.hgetall(key);
//     }

//     async keys(pattern: string): Promise<string[]> {
//         return this.client.keys(pattern);
//     }

//     async exists(key: string): Promise<boolean> {
//         const result = await this.client.exists(key);
//         return result === 1;
//     }

//     pipeline(): Redis.Pipeline {
//         return this.client.pipeline();
//     }

//     async setEx(key: string, seconds: number, value: string): Promise<void> {
//         await this.client.setex(key, seconds, value);
//     }

//     async incr(key: string): Promise<number> {
//         return this.client.incr(key);
//     }

//     async zAdd(key: string, score: number | { score: number; value: string }[], member?: string): Promise<void> {
//         if (Array.isArray(score)) {
//             const args = score.flatMap(item => [item.score, item.value]);
//             await this.client.zadd(key, ...args);
//         } else if (member) {
//             await this.client.zadd(key, score, member);
//         }
//     }

//     async zRange(key: string, start: number, stop: number): Promise<string[]> {
//         return this.client.zrange(key, start, stop);
//     }

//     async zRevRange(key: string, start: number, stop: number): Promise<string[]> {
//         return this.client.zrevrange(key, start, stop);
//     }

//     async zRem(key: string, member: string): Promise<void> {
//         await this.client.zrem(key, member);
//     }

//     async smembers(key: string): Promise<string[]> {
//         return this.client.smembers(key);
//     }

//     async disconnect(): Promise<void> {
//         await this.client.quit();
//         this.isConnected = false;
//     }

//     async healthCheck(): Promise<boolean> {
//         try {
//             await this.client.ping();
//             return true;
//         } catch {
//             return false;
//         }
//     }
// } 