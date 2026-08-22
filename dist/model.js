export const splitModel = (model) => {
    if (!model)
        return undefined;
    const separator = model.indexOf("/");
    if (separator < 1 || separator === model.length - 1)
        return undefined;
    return {
        provider: model.slice(0, separator),
        model: model.slice(separator + 1),
    };
};
export const isSelectableModel = (provider, model, availableModels) => 
// Native OpenCode models are not always included in the provider state.
provider === "opencode" || availableModels?.[model] !== undefined;
export const matchingProviderOverrides = (agents, runtimeModels, sourceProvider, targetProvider, targetModels) => [...agents].flatMap(([agent, config]) => {
    if (config.disable)
        return [];
    const current = splitModel(runtimeModels?.get(agent) ?? config.model);
    if (!current ||
        current.provider !== sourceProvider ||
        !targetModels.has(current.model)) {
        return [];
    }
    return [{ agent, model: `${targetProvider}/${current.model}` }];
});
