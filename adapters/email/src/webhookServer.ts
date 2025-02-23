import express from 'express';
import { Logger } from '@hiveai/utils';
import { RedisClient, REDIS_CHANNELS } from '@hiveai/utils';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';

export interface WebhookServerConfig {
    port: number;
    sendgridSigningSecret: string;
    redisClient: RedisClient;
}

export class WebhookServer {
    private app: express.Application;
    private server: any;
    private config: WebhookServerConfig;

    constructor(config: WebhookServerConfig) {
        this.config = config;
        this.app = express();
        
        // SendGrid sends webhook events as JSON
        this.app.use(express.json({
            verify: (req: any, _res: any, buf: Buffer) => {
                req.rawBody = buf.toString();
            }
        }));

        this.setupRoutes();
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
                    body: JSON.stringify(req.body).substring(0, 100) + '...' // Log first 100 chars
                });

                // Verify webhook signature
                if (!this.verifySignature(req)) {
                    Logger.warn('Invalid SendGrid webhook signature');
                    return res.status(401).json({ error: 'Invalid signature' });
                }

                const events = req.body;
                
                // Process each event in the webhook payload
                for (const event of events) {
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
                }

                res.status(200).json({ status: 'ok' });
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