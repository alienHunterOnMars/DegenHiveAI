import amqp, { Channel, Connection } from 'amqplib';
import { EventEmitter } from 'events';

export interface MessageBrokerConfig {
    url: string;
    exchange: string;
    clientId: string;
}

export interface CrossClientMessage {
    source?: string;
    type: 'MESSAGE' | 'ALERT' | 'NOTIFICATION' | 'COMMAND';
    payload: {
        content: string;
        timestamp: number;
    };
}

export class MessageBroker extends EventEmitter {
    private connection?: Connection;
    private channel?: Channel;
    private readonly config: MessageBrokerConfig;

    constructor(config: MessageBrokerConfig) {
        super();
        this.config = config;
    }

    async connect(): Promise<void> {
        try {
            this.connection = await amqp.connect(this.config.url);
            this.channel = await this.connection.createChannel();
            
            await this.channel.assertExchange(this.config.exchange, 'fanout', { durable: false });
            
            const { queue } = await this.channel.assertQueue('', { exclusive: true });
            await this.channel.bindQueue(queue, this.config.exchange, '');
            
            this.channel.consume(queue, (msg) => {
                if (msg) {
                    try {
                        const message = JSON.parse(msg.content.toString()) as CrossClientMessage;
                        if (message.source !== this.config.clientId) {
                            this.emit('message', message);
                        }
                    } catch (error) {
                        console.log('Error processing message:');
                    }
                }
            }, { noAck: true });

        } catch (error) {
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.channel?.close();
            await this.connection?.close();
        } catch (error) {
            throw error;
        }
    }

    async publish(message: Omit<CrossClientMessage, 'source'>): Promise<void> {
        if (!this.channel) {
            throw new Error('MessageBroker not connected');
        }

        try {
            const fullMessage: CrossClientMessage = {
                ...message,
                source: this.config.clientId
            };

            await this.channel.publish(
                this.config.exchange,
                '',
                Buffer.from(JSON.stringify(fullMessage))
            );
        } catch (error) {
            throw error;
        }
    }
} 