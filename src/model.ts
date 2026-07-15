export const splitModel = (model: string | undefined) => {
  if (!model) return undefined
  const separator = model.indexOf("/")
  if (separator < 1 || separator === model.length - 1) return undefined
  return {
    provider: model.slice(0, separator),
    model: model.slice(separator + 1),
  }
}

type AgentConfig = {
  model?: string
  disable?: boolean
}

export const matchingProviderOverrides = (
  agents: Iterable<[string, AgentConfig]>,
  runtimeModels: ReadonlyMap<string, string> | undefined,
  sourceProvider: string,
  targetProvider: string,
  targetModels: ReadonlySet<string>,
) =>
  [...agents].flatMap(([agent, config]) => {
    if (config.disable) return []
    const current = splitModel(runtimeModels?.get(agent) ?? config.model)
    if (
      !current ||
      current.provider !== sourceProvider ||
      !targetModels.has(current.model)
    ) {
      return []
    }
    return [{ agent, model: `${targetProvider}/${current.model}` }]
  })
