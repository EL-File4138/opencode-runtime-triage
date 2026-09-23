import { OpenCode } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { setTimeout as delay } from "node:timers/promises";
import { Runtime } from "./rpc.js";
export async function formClient(instance, directory) {
    const endpoint = await Service.discover();
    if (!endpoint)
        throw new Error("Desktop forms require the managed OpenCode service. Use command arguments on a standalone server.");
    const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
    const identity = await client.rpc(Runtime).instance({}, { location: { directory } });
    if (identity !== instance)
        throw new Error("The discovered service is not this plugin's server. Use command arguments on this server.");
    return client;
}
export class RuntimeForms {
    connect;
    active = new Map();
    constructor(connect) {
        this.connect = connect;
    }
    async open(input, apply) {
        if (this.active.has(input.sessionID))
            throw new Error("A runtime triage form is already open in this session");
        const controller = new AbortController();
        // Reserve the session before connecting so simultaneous commands cannot open duplicates.
        const task = { controller, done: Promise.resolve() };
        this.active.set(input.sessionID, task);
        try {
            const client = await this.connect();
            const form = await client.session.form.create(input, { signal: controller.signal });
            const ref = { sessionID: input.sessionID, formID: form.id };
            task.done = (async () => {
                try {
                    while (!controller.signal.aborted) {
                        const detail = await client.session.form.get(ref, { signal: controller.signal });
                        if (detail.state.status === "cancelled")
                            return;
                        if (detail.state.status === "answered") {
                            await apply(detail.state.answer);
                            return;
                        }
                        await delay(500, undefined, { signal: controller.signal });
                    }
                }
                catch (error) {
                    if (!controller.signal.aborted) {
                        console.error("Runtime triage form failed", error);
                        await client.session.form.create({ sessionID: input.sessionID, title: "Runtime triage failed", fields: [{ key: "message", type: "string", title: "Error", default: String(error) }] }).catch(console.error);
                    }
                }
                finally {
                    if (controller.signal.aborted)
                        await client.session.form.cancel(ref).catch(console.error);
                    this.active.delete(input.sessionID);
                }
            })();
        }
        catch (error) {
            this.active.delete(input.sessionID);
            throw error;
        }
    }
    async close() {
        const tasks = [...this.active.values()];
        for (const task of tasks)
            task.controller.abort();
        await Promise.all(tasks.map((task) => task.done));
    }
}
