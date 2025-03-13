import express from 'express';
import { Logger } from '@hiveai/utils';
import { RedisClient, REDIS_CHANNELS } from '@hiveai/utils';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WebhookServerConfig {
    port: number;
    sendgridSigningSecret: string;
    redisClient: RedisClient;
}

export class WebhookServer {
    private app: express.Application;
    private server: any;
    private config: WebhookServerConfig;
    private processedEventsFile: string;
    private processedEvents: Set<string>;
    private readonly MAX_STORED_EVENTS = 10000; // Limit the number of stored event IDs

    constructor(config: WebhookServerConfig) {
        this.config = config;
        this.app = express();
        
        // Initialize processed events tracking with fixed path
        this.processedEventsFile = path.join(__dirname, '../data/processed_events.json');
        
        // Ensure the data directory exists
        const dataDir = path.dirname(this.processedEventsFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        this.processedEvents = this.loadProcessedEvents();
        
        // SendGrid sends webhook events as JSON
        this.app.use(express.json({
            verify: (req: any, _res: any, buf: Buffer) => {
                req.rawBody = buf.toString();
            }
        }));

        this.setupRoutes();
    }

    private loadProcessedEvents(): Set<string> {
        try {
            if (fs.existsSync(this.processedEventsFile)) {
                const data = fs.readFileSync(this.processedEventsFile, 'utf8');
                const events = JSON.parse(data);
                return new Set(events);
            }
        } catch (error) {
            Logger.error('Error loading processed events:', error);
        }
        return new Set();
    }

    private saveProcessedEvents(): void {
        try {
            const eventsArray = Array.from(this.processedEvents);
            fs.writeFileSync(this.processedEventsFile, JSON.stringify(eventsArray));
        } catch (error) {
            Logger.error('Error saving processed events:', error);
        }
    }

    private addProcessedEvent(eventId: string): void {
        this.processedEvents.add(eventId);
        
        // If we exceed the maximum number of stored events, remove the oldest ones
        if (this.processedEvents.size > this.MAX_STORED_EVENTS) {
            const eventsArray = Array.from(this.processedEvents);
            const eventsToRemove = eventsArray.slice(0, eventsArray.length - this.MAX_STORED_EVENTS);
            eventsToRemove.forEach(event => this.processedEvents.delete(event));
        }
        
        this.saveProcessedEvents();
    }

    private isEventProcessed(eventId: string): boolean {
        return this.processedEvents.has(eventId);
    }

    private verifySignature(req: any): boolean {
        try {
            const signature = req.headers['x-twilio-email-event-webhook-signature'];
            const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];

            Logger.info('Webhook signature verification:', {
                hasSignature: !!signature,
                hasTimestamp: !!timestamp,
                signatureHeader: signature,
                timestampHeader: timestamp,
                receivedHeaders: JSON.stringify(req.headers),
                rawBody: req.rawBody?.substring(0, 100) + '...' // Log first 100 chars of body
            });

            if (!signature || !timestamp) {
                Logger.warn('Missing signature or timestamp headers');
                return false;
            }

            const payload = timestamp + req.rawBody;
            const hmac = crypto
                .createHmac('sha256', this.config.sendgridSigningSecret)
                .update(payload)
                .digest();

            // Verify the signature using public key verification
            try {
                const verifier = crypto.createVerify('SHA256');
                verifier.update(payload);
                const publicKey = crypto.createPublicKey({
                    key: Buffer.from(this.config.sendgridSigningSecret, 'base64'),
                    format: 'der',
                    type: 'spki'
                });
                
                const isValid = verifier.verify(publicKey, Buffer.from(signature, 'base64'));
                Logger.info('Signature verification result:', { 
                    isValid,
                    verificationMethod: 'public-key'
                });
                return isValid;
            } catch (verifyError: any) {
                // Fall back to HMAC comparison if public key verification fails
                Logger.info('Falling back to HMAC comparison:', { 
                    error: verifyError.message 
                });
                
                // Extract the actual signature from DER format
                const derBuffer = Buffer.from(signature, 'base64');
                // The actual signature is the last 32 bytes of the DER format
                const actualSignature = derBuffer.slice(-32);
                
                const isValid = crypto.timingSafeEqual(actualSignature, hmac);
                Logger.info('Signature verification result:', { 
                    isValid,
                    verificationMethod: 'hmac',
                    actualSignatureLength: actualSignature.length,
                    hmacLength: hmac.length
                });
                return isValid;
            }
        } catch (error) {
            Logger.error('Error verifying signature:', error);
            return false;
        }
    }

    private setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (_req: any, res: any) => {
            res.status(200).json({ status: 'ok' });
        });

        // SendGrid webhook endpoint
        this.app.post('/webhook/sendgrid', async (req: any, res: any) => {
            try {
                Logger.info('Received SendGrid webhook request:', {
                    headers: req.headers,
                    bodyLength: req.rawBody?.length,
                    body: JSON.stringify(req.body).substring(0, 100) + '...'
                });

                if (!this.verifySignature(req)) {
                    Logger.warn('Invalid SendGrid webhook signature');
                    return res.status(401).json({ error: 'Invalid signature' });
                }

                const events = req.body;
                let processedCount = 0;
                let skippedCount = 0;
                
                // Process each event in the webhook payload
                for (const event of events) {
                    
                    if (event.email === "rahulmittal4233@gmail.com") {
                        continue;
                    }
                    
                    if (!event.sg_event_id) {
                        Logger.warn('Event missing sg_event_id:', event);
                        continue;
                    }

                    // Skip if we've already processed this event
                    if (this.isEventProcessed(event.sg_event_id)) {
                        Logger.info(`Skipping duplicate event: ${event.sg_event_id}`);
                        skippedCount++;
                        continue;
                    }

                    // Process the event
                    await this.config.redisClient.publish(REDIS_CHANNELS.INTERNAL, {
                        id: uuid(),
                        timestamp: Date.now(),
                        type: 'INTERNAL',
                        source: 'email',
                        destination: 'hivemind/ceo',
                        payload: {
                            type: 'email_event',
                            event_type: event.event,
                            email: event.email,
                            timestamp: event.timestamp,
                            sg_event_id: event.sg_event_id,
                            sg_message_id: event.sg_message_id,
                            category: event.category,
                            response: event.response,
                            reason: event.reason,
                            status: event.status,
                            attempt: event.attempt,
                        }
                    });

                    // Mark event as processed
                    this.addProcessedEvent(event.sg_event_id);
                    processedCount++;
                }

                Logger.info(`Webhook processing complete: ${processedCount} processed, ${skippedCount} skipped`);
                res.status(200).json({ 
                    status: 'ok',
                    processed: processedCount,
                    skipped: skippedCount
                });
            } catch (error) {
                Logger.error('Error processing SendGrid webhook:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }

    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.config.port, () => {
                Logger.info(`Webhook server listening on port ${this.config.port}`);
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
} 