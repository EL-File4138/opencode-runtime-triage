import type { ModelRef } from "./model.js";
export declare class RuntimeState {
    private readonly now;
    private readonly ttl;
    private owners;
    private order;
    constructor(now?: () => number, ttl?: number);
    checkpoint(): () => void;
    touch(owner: string): {
        expires: number;
        models: Map<any, any>;
    };
    set(owner: string, changes: readonly {
        agent: string;
        model: ModelRef | null;
    }[], persistent?: boolean): void;
    release(owner: string): boolean;
    expire(): boolean;
    models(): Map<string, ModelRef>;
}
