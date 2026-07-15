export declare const getRuntimeModels: (directory: string) => Map<string, string> | undefined;
export declare const setRuntimeModel: (directory: string, agent: string, model: string) => string | undefined;
export declare const restoreRuntimeModel: (directory: string, agent: string, model: string | undefined) => void;
export declare const clearRuntimeModels: (directory: string) => void;
