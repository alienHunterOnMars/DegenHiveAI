import { Etcd3 } from 'etcd3';
import { Logger } from '@hiveai/utils';

interface ServiceInfo {
    id: string;
    name: string;
    host: string;
    port: number;
    status: 'healthy' | 'unhealthy';
    lastHeartbeat: number;
    metadata: Record<string, any>;
}

export class ServiceRegistry {
    private client: Etcd3;
    private readonly namespace = '/hive-swarm/services/';
    private services: Map<string, ServiceInfo>;
    private heartbeatInterval?: NodeJS.Timeout;

    constructor() {
        this.client = new Etcd3({
            hosts: process.env.ETCD_HOSTS?.split(',') || ['localhost:2379']
        });
        this.services = new Map();
    }

    async start(): Promise<void> {
        try {
            // Start watching for service changes
            const watcher = await this.client.watch()
                .prefix(this.namespace)
                .create();
                
            watcher
                .on('put', async (res) => {
                    const serviceInfo: ServiceInfo = JSON.parse(res.value.toString());
                    this.services.set(serviceInfo.id, serviceInfo);
                    Logger.info(`Service registered: ${serviceInfo.name} (${serviceInfo.id})`);
                })
                .on('delete', async (res) => {
                    const serviceId = res.key.toString().replace(this.namespace, '');
                    this.services.delete(serviceId);
                    Logger.info(`Service deregistered: ${serviceId}`);
                });

            // Start heartbeat
            this.startHeartbeat();
            Logger.info('ServiceRegistry: Started successfully');
        } catch (error) {
            Logger.error('ServiceRegistry: Failed to start:', error);
            throw error;
        }
    }

    async register(service: Omit<ServiceInfo, 'lastHeartbeat'>): Promise<void> {
        try {
            const serviceInfo: ServiceInfo = {
                ...service,
                lastHeartbeat: Date.now()
            };

            await this.client.put(
                `${this.namespace}${service.id}`
            ).value(JSON.stringify(serviceInfo));

            this.services.set(service.id, serviceInfo);
            Logger.info(`ServiceRegistry: Registered ${service.name}`);
        } catch (error) {
            Logger.error(`ServiceRegistry: Failed to register ${service.name}:`, error);
            throw error;
        }
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(async () => {
            for (const [id, service] of this.services) {
                try {
                    await this.updateHeartbeat(id);
                } catch (error) {
                    Logger.error(`ServiceRegistry: Heartbeat failed for ${service.name}:`, error);
                }
            }
        }, 30000); // 30 second interval
    }

    private async updateHeartbeat(serviceId: string): Promise<void> {
        const service = this.services.get(serviceId);
        if (!service) return;

        service.lastHeartbeat = Date.now();
        await this.client.put(
            `${this.namespace}${serviceId}`
        ).value(JSON.stringify(service));
    }

    async getService(serviceId: string): Promise<ServiceInfo | undefined> {
        return this.services.get(serviceId);
    }

    async getAllServices(): Promise<ServiceInfo[]> {
        return Array.from(this.services.values());
    }

    async stop(): Promise<void> {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        await this.client.delete().prefix(this.namespace);
        await this.client.close();
        Logger.info('ServiceRegistry: Stopped');
    }
} 