import { Kafka, Producer, Consumer, Message, CompressionTypes } from 'kafkajs';
import { Logger } from '@hiveai/utils';

interface KafkaConfig {
    clientId: string;
    brokers: string[];
    maxRetries?: number;
    retryInterval?: number;
    compression?: CompressionTypes;
}

export class KafkaEventBus {
    private kafka: Kafka;
    private producer: Producer;
    private consumers: Map<string, Consumer>;
    private readonly config: KafkaConfig;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    
    constructor(config?: Partial<KafkaConfig>) {
        this.config = {
            clientId: config?.clientId || 'hive-swarm',
            brokers: config?.brokers || process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
            maxRetries: config?.maxRetries || 8,
            retryInterval: config?.retryInterval || 100,
            compression: config?.compression || CompressionTypes.GZIP
        };
        
        this.kafka = new Kafka({
            clientId: this.config.clientId,
            brokers: this.config.brokers,
            retry: {
                initialRetryTime: this.config.retryInterval,
                retries: this.config.maxRetries
            }
        });
        
        this.producer = this.kafka.producer({
            allowAutoTopicCreation: true,
            transactionTimeout: 30000,
            maxInFlightRequests: 100
        });
        this.consumers = new Map();
    }

    async connect(): Promise<void> {
        try {
            if (this.isConnected) return;
            
            await this.producer.connect();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            Logger.info('KafkaEventBus: Producer connected');
        } catch (error) {
            this.reconnectAttempts++;
            Logger.error(`KafkaEventBus: Failed to connect producer (attempt ${this.reconnectAttempts}):`, error);
            
            if (this.reconnectAttempts < this.config.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, this.config.retryInterval));
                return this.connect();
            }
            throw error;
        }
    }

    async publish(topic: string, message: any, key?: string): Promise<void> {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            await this.producer.send({
                topic,
                compression: this.config.compression,
                messages: [{ 
                    key: key || Date.now().toString(),
                    value: JSON.stringify(message),
                    timestamp: Date.now().toString(),
                    headers: {
                        'content-type': 'application/json',
                        'source': this.config.clientId
                    }
                }]
            });
        } catch (error) {
            Logger.error(`KafkaEventBus: Failed to publish to ${topic}:`, error);
            this.isConnected = false;
            throw error;
        }
    }

    async subscribe(
        topic: string, 
        groupId: string, 
        handler: (message: any) => Promise<void>,
        options: { 
            batchSize?: number,
            autoCommit?: boolean 
        } = {}
    ): Promise<void> {
        try {
            const consumer = this.kafka.consumer({ 
                groupId,
                maxInFlightRequests: 10,
                sessionTimeout: 30000,
                heartbeatInterval: 3000
            });

            await consumer.connect();
            await consumer.subscribe({ 
                topic, 
                fromBeginning: false 
            });
            
            await consumer.run({
                autoCommit: options.autoCommit ?? true,
                partitionsConsumedConcurrently: 3,
                eachBatchAutoResolve: true,
                eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
                    for (const message of batch.messages) {
                        if (!isRunning() || isStale()) break;

                        try {
                            const parsedMessage = JSON.parse(message.value?.toString() || '');
                            await handler(parsedMessage);
                            resolveOffset(message.offset);
                            await heartbeat();
                        } catch (error) {
                            Logger.error(`KafkaEventBus: Error processing message from ${topic}:`, error);
                        }
                    }
                }
            });

            this.consumers.set(topic, consumer);
            Logger.info(`KafkaEventBus: Subscribed to ${topic}`);
        } catch (error) {
            Logger.error(`KafkaEventBus: Failed to subscribe to ${topic}:`, error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.producer.disconnect();
            for (const consumer of this.consumers.values()) {
                await consumer.disconnect();
            }
            this.isConnected = false;
            Logger.info('KafkaEventBus: Disconnected');
        } catch (error) {
            Logger.error('KafkaEventBus: Error during disconnect:', error);
            throw error;
        }
    }

    // Health check method
    async healthCheck(): Promise<boolean> {
        try {
            if (!this.isConnected) {
                await this.connect();
            }
            return this.isConnected;
        } catch (error) {
            return false;
        }
    }
} 