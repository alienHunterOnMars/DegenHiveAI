// import { Logger } from '@hiveai/utils';
// import { RedisClient } from './RedisClient';

// interface ServiceInfo {
//     id: string;
//     name: string;
//     host: string;
//     port: number;
//     status: 'healthy' | 'unhealthy' | 'starting';
//     metadata?: Record<string, any>;
//     lastHeartbeat?: number;
// }

// export class ServiceRegistry {
//     private heartbeatInterval?: NodeJS.Timeout;
//     private readonly servicePrefix = 'service:';
//     private readonly ttl = 60; // seconds

//     constructor(
//         private redis: RedisClient,
//         private heartbeatFrequency: number = 30000 // 30 seconds
//     ) {}

//     async connect(): Promise<void> {
//         try {
//             // Start heartbeat
//             this.startHeartbeat();
//             Logger.info('ServiceRegistry: Connected');
//         } catch (error) {
//             Logger.error('ServiceRegistry: Connection failed:', error);
//             throw error;
//         }
//     }

//     async register(service: ServiceInfo): Promise<void> {
//         try {
//             const key = `${this.servicePrefix}${service.name}:${service.id}`;
//             const data = {
//                 ...service,
//                 lastHeartbeat: Date.now()
//             };

//             await this.redis.setEx(key, this.ttl, JSON.stringify(data));
//             Logger.info(`ServiceRegistry: Registered ${service.name}:${service.id}`);
//         } catch (error) {
//             Logger.error('ServiceRegistry: Registration failed:', error);
//             throw error;
//         }
//     }

//     async unregister(serviceName: string, serviceId: string): Promise<void> {
//         try {
//             const key = `${this.servicePrefix}${serviceName}:${serviceId}`;
//             await this.redis.del(key);
//             Logger.info(`ServiceRegistry: Unregistered ${serviceName}:${serviceId}`);
//         } catch (error) {
//             Logger.error('ServiceRegistry: Unregistration failed:', error);
//             throw error;
//         }
//     }

//     async getService(serviceName: string, serviceId: string): Promise<ServiceInfo | null> {
//         try {
//             const key = `${this.servicePrefix}${serviceName}:${serviceId}`;
//             const data = await this.redis.get(key);
//             return data ? JSON.parse(data) : null;
//         } catch (error) {
//             Logger.error('ServiceRegistry: Get service failed:', error);
//             throw error;
//         }
//     }

//     async getServiceInstances(serviceName: string): Promise<ServiceInfo[]> {
//         try {
//             const pattern = `${this.servicePrefix}${serviceName}:*`;
//             const keys = await this.redis.keys(pattern);
//             const services: ServiceInfo[] = [];

//             for (const key of keys) {
//                 const data = await this.redis.get(key);
//                 if (data) {
//                     services.push(JSON.parse(data));
//                 }
//             }

//             return services;
//         } catch (error) {
//             Logger.error('ServiceRegistry: Get instances failed:', error);
//             throw error;
//         }
//     }

//     async getHealthyInstance(serviceName: string): Promise<ServiceInfo | null> {
//         try {
//             const instances = await this.getServiceInstances(serviceName);
//             return instances.find(service => 
//                 service.status === 'healthy' && 
//                 service.lastHeartbeat && 
//                 Date.now() - service.lastHeartbeat < this.ttl * 1000
//             ) || null;
//         } catch (error) {
//             Logger.error('ServiceRegistry: Get healthy instance failed:', error);
//             throw error;
//         }
//     }

//     private startHeartbeat(): void {
//         if (this.heartbeatInterval) return;

//         const interval = setInterval(async () => {
//             try {
//                 // Update TTL for all services
//                 const pattern = `${this.servicePrefix}*`;
//                 const keys = await this.redis.keys(pattern);

//                 for (const key of keys) {
//                     const data = await this.redis.get(key);
//                     if (data) {
//                         const service = JSON.parse(data);
//                         await this.register(service);
//                     }
//                 }
//             } catch (error) {
//                 Logger.error('ServiceRegistry: Heartbeat failed:', error);
//             }
//         }, this.heartbeatFrequency);

//         this.heartbeatInterval = interval;
//     }

//     async disconnect(): Promise<void> {
//         if (this.heartbeatInterval) {
//             clearInterval(this.heartbeatInterval);
//             this.heartbeatInterval = undefined;
//         }
//         Logger.info('ServiceRegistry: Disconnected');
//     }

//     // Helper method to check service health
//     async checkServiceHealth(serviceName: string, serviceId: string): Promise<boolean> {
//         const service = await this.getService(serviceName, serviceId);
//         if (!service) return false;

//         return (
//             service.status === 'healthy' &&
//             service.lastHeartbeat &&
//             Date.now() - service.lastHeartbeat < this.ttl * 1000
//         );
//     }

//     // Get all registered services
//     async getAllServices(): Promise<Record<string, ServiceInfo[]>> {
//         try {
//             const pattern = `${this.servicePrefix}*`;
//             const keys = await this.redis.keys(pattern);
//             const services: Record<string, ServiceInfo[]> = {};

//             for (const key of keys) {
//                 const data = await this.redis.get(key);
//                 if (data) {
//                     const service = JSON.parse(data);
//                     if (!services[service.name]) {
//                         services[service.name] = [];
//                     }
//                     services[service.name].push(service);
//                 }
//             }

//             return services;
//         } catch (error) {
//             Logger.error('ServiceRegistry: Get all services failed:', error);
//             throw error;
//         }
//     }
// } 