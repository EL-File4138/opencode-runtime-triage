import { matchingProviderOverrides, splitModel } from "./model.js";
import { clearRuntimeModels, getRuntimeModels, restoreRuntimeModel, setRuntimeModel, } from "./state.js";
const isPreset = (value) => {
    if (!value || typeof value !== "object")
        return false;
    const preset = value;
    return (typeof preset.label === "string" &&
        typeof preset.provider === "string" &&
        typeof preset.model === "string" &&
        (preset.description === undefined || typeof preset.description === "string"));
};
const tui = async (api, rawOptions) => {
    const options = rawOptions;
    const presets = (options?.presets ?? []).filter(isPreset);
    clearRuntimeModels(api.state.path.directory);
    const agentEntries = () => Object.entries(api.state.config.agent ?? {}).filter((entry) => entry[1] !== undefined);
    const configuredModels = new Map(agentEntries().map(([agent, config]) => [
        agent,
        config.model,
    ]));
    const showError = (message) => {
        api.ui.toast({
            variant: "error",
            title: "Runtime triage",
            message,
        });
    };
    const reload = async (directory) => {
        const result = await api.client.instance.dispose({ directory });
        return result.error;
    };
    const applyPreset = async (agent, preset) => {
        api.ui.dialog.clear();
        const directory = api.state.path.directory;
        const model = preset ? `${preset.provider}/${preset.model}` : undefined;
        const previous = getRuntimeModels(directory)?.get(agent);
        if (model)
            setRuntimeModel(directory, agent, model);
        else
            restoreRuntimeModel(directory, agent, undefined);
        try {
            const error = await reload(directory);
            if (error) {
                restoreRuntimeModel(directory, agent, previous);
                showError(`Could not reload ${agent}: ${JSON.stringify(error)}`);
                return;
            }
            api.ui.toast({
                variant: "success",
                title: "Runtime model updated",
                message: model
                    ? `${agent} now uses ${model}`
                    : `${agent} now uses its configured model`,
            });
        }
        catch (error) {
            restoreRuntimeModel(directory, agent, previous);
            showError(`Could not reload ${agent}: ${String(error)}`);
        }
    };
    const selectPreset = (agent) => {
        const directory = api.state.path.directory;
        const current = getRuntimeModels(directory)?.get(agent) ??
            api.state.config.agent?.[agent]?.model;
        const providerAvailable = new Map(api.state.provider.map((provider) => [provider.id, provider.models]));
        const presetOptions = [
            {
                title: "Use configured model",
                value: null,
                description: configuredModels.get(agent) ?? "Default model",
                category: "Runtime",
                disabled: !getRuntimeModels(directory)?.has(agent),
            },
            ...presets.map((preset) => ({
                title: preset.label,
                value: preset,
                description: preset.description ?? `${preset.provider}/${preset.model}`,
                category: preset.provider,
                disabled: !providerAvailable.get(preset.provider)?.[preset.model],
            })),
        ];
        api.ui.dialog.replace(() => api.ui.DialogSelect({
            title: `Model for ${agent}`,
            placeholder: "Search predefined models",
            current: presets.find((preset) => `${preset.provider}/${preset.model}` === current) ?? null,
            options: presetOptions,
            onSelect: (option) => void applyPreset(agent, option.value),
        }));
    };
    const selectAgent = () => {
        if (presets.length === 0) {
            showError("No valid presets are configured");
            return;
        }
        const runtimeModels = getRuntimeModels(api.state.path.directory);
        const agents = agentEntries()
            .filter(([, config]) => !config.disable)
            .sort(([left], [right]) => left.localeCompare(right));
        if (agents.length === 0) {
            showError("No configured agents are available");
            return;
        }
        api.ui.dialog.replace(() => api.ui.DialogSelect({
            title: "Select agent",
            placeholder: "Search agents",
            options: agents.map(([name, config]) => ({
                title: name,
                value: name,
                description: runtimeModels?.get(name) ?? config.model ?? "Uses the default model",
            })),
            onSelect: (option) => selectPreset(option.value),
        }));
    };
    const applyProviderOverride = async (sourceProvider, targetProvider) => {
        api.ui.dialog.clear();
        const directory = api.state.path.directory;
        const runtimeModels = getRuntimeModels(directory);
        const targetModels = api.state.provider.find((provider) => provider.id === targetProvider)?.models;
        if (!targetModels) {
            showError(`Provider ${targetProvider} is not available`);
            return;
        }
        const matches = matchingProviderOverrides(agentEntries(), runtimeModels, sourceProvider, targetProvider, new Set(Object.keys(targetModels)));
        if (matches.length === 0) {
            api.ui.toast({
                variant: "warning",
                title: "No matching models",
                message: `${sourceProvider} and ${targetProvider} have no agent models in common`,
            });
            return;
        }
        const previous = new Map(matches.map(({ agent }) => [agent, runtimeModels?.get(agent)]));
        for (const { agent, model } of matches) {
            setRuntimeModel(directory, agent, model);
        }
        try {
            const error = await reload(directory);
            if (error) {
                for (const [agent, model] of previous) {
                    restoreRuntimeModel(directory, agent, model);
                }
                showError(`Could not reload agents: ${JSON.stringify(error)}`);
                return;
            }
            api.ui.toast({
                variant: "success",
                title: "Runtime provider override",
                message: `${sourceProvider} -> ${targetProvider} for ${matches.length} matching agent${matches.length === 1 ? "" : "s"}`,
            });
        }
        catch (error) {
            for (const [agent, model] of previous) {
                restoreRuntimeModel(directory, agent, model);
            }
            showError(`Could not reload agents: ${String(error)}`);
        }
    };
    const selectTargetProvider = (sourceProvider) => {
        const runtimeModels = getRuntimeModels(api.state.path.directory);
        const sourceModels = agentEntries().flatMap(([agent, config]) => {
            if (config.disable)
                return [];
            const current = splitModel(runtimeModels?.get(agent) ?? config.model);
            return current?.provider === sourceProvider ? [current.model] : [];
        });
        api.ui.dialog.replace(() => api.ui.DialogSelect({
            title: `Override ${sourceProvider} with`,
            placeholder: "Search target providers",
            options: api.state.provider
                .filter((provider) => provider.id !== sourceProvider)
                .map((provider) => {
                const matchCount = sourceModels.filter((model) => provider.models[model]).length;
                return {
                    title: provider.name,
                    value: provider.id,
                    description: `${provider.id} (${matchCount} matching agent model${matchCount === 1 ? "" : "s"})`,
                    disabled: matchCount === 0,
                };
            })
                .sort((left, right) => left.title.localeCompare(right.title)),
            onSelect: (option) => void applyProviderOverride(sourceProvider, option.value),
        }));
    };
    const selectSourceProvider = () => {
        const runtimeModels = getRuntimeModels(api.state.path.directory);
        const providerCounts = new Map();
        for (const [agent, config] of agentEntries()) {
            if (config.disable)
                continue;
            const current = splitModel(runtimeModels?.get(agent) ?? config.model);
            if (!current)
                continue;
            providerCounts.set(current.provider, (providerCounts.get(current.provider) ?? 0) + 1);
        }
        api.ui.dialog.replace(() => api.ui.DialogSelect({
            title: "Select provider to override",
            placeholder: "Search providers used by agents",
            options: [...providerCounts]
                .map(([provider, count]) => ({
                title: api.state.provider.find((item) => item.id === provider)?.name ??
                    provider,
                value: provider,
                description: `${provider} (${count} agent${count === 1 ? "" : "s"})`,
            }))
                .sort((left, right) => left.title.localeCompare(right.title)),
            onSelect: (option) => selectTargetProvider(option.value),
        }));
    };
    api.command.register(() => [
        {
            title: "Runtime model override",
            value: "runtime-triage.model",
            description: "Temporarily assign a provider/model pair to an agent",
            category: "Runtime Triage",
            slash: { name: "rt-model" },
            onSelect: selectAgent,
        },
        {
            title: "Runtime provider override",
            value: "runtime-triage.provider",
            description: "Temporarily replace a provider where model IDs overlap",
            category: "Runtime Triage",
            slash: { name: "rt-provider" },
            onSelect: selectSourceProvider,
        },
    ]);
    api.lifecycle.onDispose(() => {
        clearRuntimeModels(api.state.path.directory);
    });
};
const plugin = {
    id: "opencode-runtime-triage.tui",
    tui,
};
export default plugin;
