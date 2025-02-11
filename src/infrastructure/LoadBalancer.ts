import { Logger } from '@hiveai/utils';
import { ServiceRegistry } from './ServiceRegistry';
import { createHash } from 'crypto';

interface Node {
    id: string;
    weight: number;
    virtualNodes: number;
}

export class LoadBalancer {
    private ring: Map<number, string>;
    private sortedKeys: number[];
    private nodes: Map<string, Node>;
    private readonly virtualNodesCount = 200; // Number of virtual nodes per physical node

    constructor(private registry: ServiceRegistry) {
        this.ring = new Map();
        this.sortedKeys = [];
        this.nodes = new Map();
    }

    async start(): Promise<void> {
        try {
            // Initial load of services
            const services = await this.registry.getAllServices();
            services.forEach(service => {
                this.addNode({
                    id: service.id,
                    weight: 1,
                    virtualNodes: this.virtualNodesCount
                });
            });

            // Watch for service changes
            this.watchServiceChanges();
            Logger.info('LoadBalancer: Started successfully');
        } catch (error) {
            Logger.error('LoadBalancer: Failed to start:', error);
            throw error;
        }
    }

    private watchServiceChanges(): void {
        // Implement service change watching logic here
        // This would update the hash ring when services come and go
    }

    private addNode(node: Node): void {
        this.nodes.set(node.id, node);
        
        // Add virtual nodes to the ring
        for (let i = 0; i < node.virtualNodes; i++) {
            const hash = this.getHash(`${node.id}-${i}`);
            this.ring.set(hash, node.id);
        }
        
        this.updateSortedKeys();
    }

    private removeNode(nodeId: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        // Remove virtual nodes from the ring
        for (let i = 0; i < node.virtualNodes; i++) {
            const hash = this.getHash(`${nodeId}-${i}`);
            this.ring.delete(hash);
        }

        this.nodes.delete(nodeId);
        this.updateSortedKeys();
    }

    private updateSortedKeys(): void {
        this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
    }

    private getHash(key: string): number {
        return parseInt(createHash('md5').update(key).digest('hex').substring(0, 8), 16);
    }

    getNode(key: string): string {
        if (this.sortedKeys.length === 0) {
            throw new Error('No available nodes');
        }

        const hash = this.getHash(key);
        const index = this.findClosestNode(hash);
        return this.ring.get(this.sortedKeys[index]) || this.ring.get(this.sortedKeys[0])!;
    }

    private findClosestNode(hash: number): number {
        let left = 0;
        let right = this.sortedKeys.length;

        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (this.sortedKeys[mid] < hash) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        return left === this.sortedKeys.length ? 0 : left;
    }

    async routeRequest(userId: string, requestType: string): Promise<string> {
        try {
            const nodeId = this.getNode(`${userId}-${requestType}`);
            const service = await this.registry.getService(nodeId);
            
            if (!service) {
                throw new Error(`No available service for node ${nodeId}`);
            }

            return `http://${service.host}:${service.port}`;
        } catch (error) {
            Logger.error('LoadBalancer: Failed to route request:', error);
            throw error;
        }
    }
} 