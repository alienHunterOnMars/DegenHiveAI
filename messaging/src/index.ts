import amqp, { Channel, Connection, Message } from 'amqplib';
import { EventEmitter } from 'events';
import { Logger } from '@hiveai/utils';

export interface MessageBrokerConfig {
    url: string;
    exchange: string;
    clientId: string;
    reconnectInterval?: number;
}

export interface CrossClientMessage {
    source: string;
    target?: string; // Optional, if not specified, broadcast to all
    type: 'MESSAGE' | 'ALERT' | 'NOTIFICATION' | 'COMMAND';
    payload: any;
    timestamp: number;
    messageId: string;
}

export class MessageBroker extends EventEmitter {
    private connection?: Connection;
    private channel?: Channel;
    private readonly config: MessageBrokerConfig;
    private reconnectTimer?: NodeJS.Timeout;
    private readonly queues: Set<string> = new Set();

    constructor(config: MessageBrokerConfig) {
        super();
        this.config = {
            reconnectInterval: 5000,
            ...config
        };
    }

    async connect(): Promise<void> {
        try {
            this.connection = await amqp.connect(this.config.url);
            this.channel = await this.connection.createChannel();

            // Setup exchange
            await this.channel.assertExchange(this.config.exchange, 'topic', {
                durable: true
            });

            // Setup client-specific queue
            const queueName = `${this.config.exchange}.${this.config.clientId}`;
            await this.channel.assertQueue(queueName, {
                durable: true,
                arguments: {
                    'x-message-ttl': 60000, // Messages expire after 1 minute
                    'x-max-length': 1000 // Limit queue size
                }
            });

            // Bind to client-specific messages and broadcasts
            await this.channel.bindQueue(queueName, this.config.exchange, this.config.clientId);
            await this.channel.bindQueue(queueName, this.config.exchange, 'broadcast');

            // Setup message handling
            await this.channel.consume(queueName, this.handleMessage.bind(this), {
                noAck: false
            });

            this.setupErrorHandlers();
            Logger.info(`MessageBroker connected for client ${this.config.clientId}`);
        } catch (error) {
            Logger.error('Failed to connect to RabbitMQ:', error);
            this.scheduleReconnect();
        }
    }

    private setupErrorHandlers(): void {
        if (this.connection) {
            this.connection.on('error', (error) => {
                Logger.error('RabbitMQ connection error:', error);
                this.scheduleReconnect();
            });

            this.connection.on('close', () => {
                Logger.warn('RabbitMQ connection closed');
                this.scheduleReconnect();
            });
        }
    }

    private scheduleReconnect(): void {
        if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(async () => {
                this.reconnectTimer = undefined;
                await this.connect();
            }, this.config.reconnectInterval);
        }
    }

    private handleMessage(msg: Message | null): void {
        if (!msg) return;

        try {
            const content = JSON.parse(msg.content.toString()) as CrossClientMessage;
            this.emit('message', content);
            this.channel?.ack(msg);
        } catch (error) {
            Logger.error('Error processing message:', error);
            // Reject malformed messages
            this.channel?.reject(msg, false);
        }
    }

    async publish(message: Omit<CrossClientMessage, 'timestamp' | 'messageId'>): Promise<void> {
        if (!this.channel) {
            throw new Error('Not connected to RabbitMQ');
        }

        const fullMessage: CrossClientMessage = {
            ...message,
            timestamp: Date.now(),
            messageId: Math.random().toString(36).substring(2, 15)
        };

        const routingKey = message.target || 'broadcast';

        try {
            await this.channel.publish(
                this.config.exchange,
                routingKey,
                Buffer.from(JSON.stringify(fullMessage)),
                {
                    persistent: true,
                    messageId: fullMessage.messageId,
                    timestamp: fullMessage.timestamp,
                    contentType: 'application/json'
                }
            );
        } catch (error) {
            Logger.error('Failed to publish message:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.channel?.close();
            await this.connection?.close();
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
            Logger.info('MessageBroker disconnected');
        } catch (error) {
            Logger.error('Error disconnecting from RabbitMQ:', error);
            throw error;
        }
    }
} 