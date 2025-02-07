export interface IAgentRuntime {
    getSetting(key: string): string | undefined;
}

export type Client = {
    start(runtime: IAgentRuntime): Promise<any>;
    stop(runtime: IAgentRuntime): Promise<void>;
}; 