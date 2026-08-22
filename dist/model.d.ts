export declare const splitModel: (model: string | undefined) => {
    provider: string;
    model: string;
} | undefined;
export declare const isSelectableModel: (provider: string, model: string, availableModels: Readonly<Record<string, unknown>> | undefined) => boolean;
type AgentConfig = {
    model?: string;
    disable?: boolean;
};
export declare const matchingProviderOverrides: (agents: Iterable<[string, AgentConfig]>, runtimeModels: ReadonlyMap<string, string> | undefined, sourceProvider: string, targetProvider: string, targetModels: ReadonlySet<string>) => {
    agent: string;
    model: string;
}[];
export {};
