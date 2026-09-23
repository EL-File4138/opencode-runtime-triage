import { Plugin } from "@opencode/plugin/tui";
import { Runtime } from "./rpc.js";
import { matchingProviderOverrides, modelKey } from "./model.js";
const isPreset = (value) => {
    if (!value || typeof value !== "object")
        return false;
    const item = value;
    return [item.label, item.provider, item.model].every((value) => typeof value === "string" && value.length > 0) &&
        (item.variant === undefined || typeof item.variant === "string") &&
        (item.description === undefined || typeof item.description === "string");
};
export default Plugin.define({
    id: "opencode-runtime-triage.tui",
    setup(ctx) {
        const rpc = ctx.client.rpc(Runtime);
        const owner = crypto.randomUUID();
        const locations = new Map();
        const presets = Array.isArray(ctx.options.presets) ? ctx.options.presets.filter(isPreset) : [];
        const location = () => ctx.location ?? ctx.data.location.default();
        const toast = (message, variant = "success") => ctx.ui.toast.show({ title: "Runtime triage", message, variant });
        const apply = async (at, changes) => {
            const route = ctx.ui.router.current();
            const sessionID = route.type === "session" ? route.sessionID : undefined;
            await rpc.apply({ owner, changes, sessionID }, { location: at });
            locations.set(at.directory, at);
            await ctx.data.location.agent.sync(at);
            if (sessionID)
                await ctx.data.session.sync(sessionID);
            toast(`Updated ${changes.length} agent${changes.length === 1 ? "" : "s"}`);
        };
        const guard = (run) => async () => {
            try {
                await run();
            }
            catch (error) {
                toast(String(error), "error");
            }
        };
        const selectModel = guard(async () => {
            const at = location();
            const [agents, catalog] = await Promise.all([ctx.client.agent.list({ location: at }), ctx.client.model.list({ location: at })]);
            const agentID = await ctx.ui.dialog.select({
                title: "Select agent", placeholder: "Search agents",
                options: agents.data.map((agent) => ({ title: agent.name, value: agent.id, description: agent.model ? modelKey(agent.model) : "Default model" })),
            });
            if (agentID === undefined)
                return;
            const models = new Map();
            const refs = new Map();
            for (const model of catalog.data) {
                for (const variant of [undefined, ...model.variants.map((variant) => variant.id)]) {
                    const ref = { providerID: model.providerID, id: model.id, ...(variant ? { variant } : {}) };
                    const key = modelKey(ref);
                    refs.set(key, ref);
                    models.set(key, { title: `${model.name}${variant ? ` (${variant})` : ""}`, value: key, category: model.providerID, description: key });
                }
            }
            for (const preset of presets) {
                const key = modelKey({ providerID: preset.provider, id: preset.model, variant: preset.variant });
                const option = models.get(key);
                if (option)
                    models.set(key, { ...option, title: preset.label, description: preset.description ?? key });
            }
            const current = agents.data.find((agent) => agent.id === agentID)?.model;
            const selected = await ctx.ui.dialog.select({
                title: `Model for ${agentID}`, placeholder: "Search available models",
                current: current ? modelKey(current) : null,
                options: [
                    { title: "Restore model", value: null, category: "Runtime", description: "Remove this terminal's override" },
                    ...[...models.values()].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title)),
                ],
            });
            if (selected === undefined)
                return;
            await apply(at, [{ agent: agentID, model: selected === null ? null : refs.get(selected) }]);
        });
        const selectProvider = guard(async () => {
            const at = location();
            const [agents, models, providers] = await Promise.all([
                ctx.client.agent.list({ location: at }), ctx.client.model.list({ location: at }), ctx.client.provider.list({ location: at }),
            ]);
            const source = await ctx.ui.dialog.select({
                title: "Select provider to override",
                options: [...new Set(agents.data.flatMap((agent) => agent.model ? [agent.model.providerID] : []))].sort().map((id) => ({ title: id, value: id })),
            });
            if (source === undefined)
                return;
            const target = await ctx.ui.dialog.select({
                title: `Override ${source} with`,
                options: providers.data.filter((provider) => provider.id !== source).map((provider) => {
                    const count = matchingProviderOverrides(agents.data, source, provider.id, models.data).length;
                    return { title: provider.name, value: provider.id, description: `${count} matching agents`, disabled: count === 0 };
                }),
            });
            if (target === undefined)
                return;
            const changes = matchingProviderOverrides(agents.data, source, target, models.data);
            if (!changes.length) {
                toast("No matching models and variants", "warning");
                return;
            }
            await apply(at, changes);
        });
        ctx.ui.slot({ append: "app", render: () => {
                ctx.keymap.layer(() => ({
                    mode: "global",
                    commands: [
                        { id: "runtime-triage.model", title: "Runtime model override", group: "Runtime Triage", palette: true, slash: { name: "rt-model" }, run: selectModel },
                        { id: "runtime-triage.provider", title: "Runtime provider override", group: "Runtime Triage", palette: true, slash: { name: "rt-provider" }, run: selectProvider },
                    ],
                }));
                return null;
            } });
        const timer = setInterval(() => {
            for (const at of locations.values())
                void rpc.heartbeat({ owner }, { location: at }).catch((error) => toast(String(error), "error"));
        }, 20_000);
        return async () => {
            clearInterval(timer);
            await Promise.allSettled([...locations.values()].map((at) => rpc.release({ owner }, { location: at })));
        };
    },
});
