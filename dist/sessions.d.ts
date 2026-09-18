import type { Plugin } from "@opencode/plugin";
import { type ModelRef } from "./model.js";
export declare class RuntimeSessions {
    private readonly ctx;
    private selected;
    constructor(ctx: Plugin.Context);
    check(sessionID: string): Promise<import("@opencode/client").SessionInfo>;
    sync(models: ReadonlyMap<string, ModelRef>, sessionID?: string): Promise<void>;
}
