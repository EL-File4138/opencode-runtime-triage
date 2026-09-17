export type ModelRef = { providerID: string; id: string; variant?: string }
export const modelKey = (model: ModelRef) =>
  `${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ""}`
export const matchingProviderOverrides = (
  agents: readonly { id: string; model?: ModelRef }[],
  source: string,
  target: string,
  models: readonly { providerID: string; id: string; variants: readonly { id: string }[] }[],
) => agents.flatMap((agent) => {
  if (agent.model?.providerID !== source) return []
  const model = models.find((model) => model.providerID === target && model.id === agent.model!.id)
  if (!model || (agent.model.variant && !model.variants.some((v) => v.id === agent.model!.variant))) return []
  return [{ agent: agent.id, model: { ...agent.model, providerID: target } }]
})
