import { type OpenCodeClient, type SessionFormCreateInput } from "@opencode/client";
export declare function formClient(instance: string, directory: string): Promise<OpenCodeClient>;
export declare class RuntimeForms {
    private readonly connect;
    private active;
    constructor(connect: () => Promise<OpenCodeClient>);
    open(input: SessionFormCreateInput, apply: (answer: Record<string, unknown>) => Promise<void>): Promise<void>;
    close(): Promise<void>;
}
