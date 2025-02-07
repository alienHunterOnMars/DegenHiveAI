export interface IAgentRuntime {
    getSetting(key: string): string | undefined;
    agentId?: string;
    clients?: Record<string, any>;
}

export type Client = {
    start(runtime: IAgentRuntime): Promise<any>;
    stop(runtime: IAgentRuntime): Promise<void>;
};

export interface Plugin {
    name: string;
    description: string;
    clients: Client[];
    actions: any[];
    evaluators: any[];
    services: any[];
} 