import { Plugin, Model, Provider } from "@opencode/plugin";
import { Runtime } from "./rpc.js";
import { RuntimeState } from "./state.js";
import { RuntimeSessions } from "./sessions.js";
import { matchingProviderOverrides, modelKey } from "./model.js";
import { formClient, RuntimeForms } from "./forms.js";
export default Plugin.define({
    id: "opencode-runtime-triage.server",
    async setup(ctx) {
        const state = new RuntimeState();
        const sessions = new RuntimeSessions(ctx);
        const instance = crypto.randomUUID();
        const forms = new RuntimeForms(() => formClient(instance, ctx.location.directory));
        const transform = () => ctx.agent.transform((editor) => {
            for (const [id, model] of state.models())
                editor.update(id, (agent) => { agent.model = { ...model, id: Model.ID.make(model.id), providerID: Provider.ID.make(model.providerID), variant: model.variant ? Model.VariantID.make(model.variant) : undefined }; });
        });
        let registration;
        // Serialize mutations so a bulk change and a lease expiry cannot interleave.
        let pending = Promise.resolve();
        const serial = (action) => {
            const next = pending.then(action);
            pending = next.then(() => { }, () => { });
            return next;
        };
        const apply = async (input, persistent = false) => {
            if (input.sessionID)
                await sessions.check(input.sessionID);
            const [agents, models] = await Promise.all([ctx.agent.list(), ctx.model.list()]);
            for (const change of input.changes) {
                if (!agents.data.some((agent) => agent.id === change.agent))
                    throw new Error(`Unknown agent: ${change.agent}`);
                const ref = change.model;
                if (ref && !models.data.some((model) => model.providerID === ref.providerID && model.id === ref.id && (!ref.variant || model.variants.some((v) => v.id === ref.variant)))) {
                    throw new Error(`Unavailable model: ${ref.providerID}/${ref.id}`);
                }
            }
            const rollback = state.checkpoint();
            state.set(input.owner, input.changes, persistent);
            try {
                // Register after startup's agent sources so configured models cannot
                // overwrite runtime selections during registry replay.
                if (!registration)
                    registration = await transform();
                await ctx.agent.reload();
                await sessions.sync(state.models(), input.sessionID, true);
            }
            catch (error) {
                rollback();
                await ctx.agent.reload();
                await sessions.sync(state.models());
                throw error;
            }
            return null;
        };
        const refresh = async () => {
            await ctx.agent.reload();
            await sessions.sync(state.models());
        };
        await ctx.session.hook("prompt", ({ sessionID }) => serial(async () => {
            await sessions.sync(state.models(), sessionID);
        }));
        await ctx.command.transform((editor) => {
            editor.add({ name: "rt-model", description: "Runtime model: <agent> <provider/model#variant|restore>", execute: ({ sessionID, prompt }) => serial(async () => {
                    if (!prompt.text.trim()) {
                        throw new Error("Desktop does not display session forms yet. Use /rt-model <agent> <provider/model#variant|restore>.");
                    }
                    const args = prompt.text.trim().split(/\s+/);
                    if (args.length !== 2)
                        throw new Error("Usage: /rt-model <agent> <provider/model#variant|restore>");
                    const [agent, key] = args;
                    const catalog = await ctx.model.list();
                    const model = catalog.data.flatMap((m) => [undefined, ...m.variants.map((v) => v.id)].map((variant) => ({ providerID: m.providerID, id: m.id, variant }))).find((m) => modelKey(m) === key);
                    if (key !== "restore" && !model)
                        throw new Error(`Unavailable model: ${key}`);
                    await apply({ owner: `command:${sessionID}`, sessionID, changes: [{ agent: agent, model: model ?? null }] }, true);
                }) });
            editor.add({ name: "rt-provider", description: "Runtime provider: <source> <target>, or restore", execute: ({ sessionID, prompt }) => serial(async () => {
                    if (!prompt.text.trim()) {
                        throw new Error("Desktop does not display session forms yet. Use /rt-provider <source> <target>, or /rt-provider restore.");
                    }
                    const args = prompt.text.trim().split(/\s+/);
                    if (args.length === 1 && args[0] === "restore") {
                        if (state.release(`command:${sessionID}`))
                            await refresh();
                        return;
                    }
                    if (args.length !== 2)
                        throw new Error("Usage: /rt-provider <source> <target>, or /rt-provider restore");
                    const [agents, models] = await Promise.all([ctx.agent.list(), ctx.model.list()]);
                    const changes = matchingProviderOverrides(agents.data, args[0], args[1], models.data);
                    if (!changes.length)
                        throw new Error("No matching models and variants");
                    await apply({ owner: `command:${sessionID}`, sessionID, changes }, true);
                }) });
        });
        await ctx.rpc.register(Runtime, {
            instance: async () => instance,
            apply: (input) => serial(() => apply(input)),
            heartbeat: (input) => serial(async () => {
                if (state.expire())
                    await refresh();
                state.touch(input.owner);
                return null;
            }),
            release: (input) => serial(async () => {
                if (state.release(input.owner))
                    await refresh();
                return null;
            }),
        });
        const timer = setInterval(() => {
            void serial(async () => { if (state.expire())
                await refresh(); }).catch(console.error);
        }, 15_000);
        return async () => {
            clearInterval(timer);
            await forms.close();
            await serial(() => sessions.sync(new Map()));
        };
    },
});
