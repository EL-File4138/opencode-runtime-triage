import type { Plugin, PluginModule } from "@opencode-ai/plugin"
import { getRuntimeModels } from "./state.js"

const server: Plugin = async ({ directory }) => ({
  config: async (config) => {
    const overrides = getRuntimeModels(directory)
    if (!overrides?.size) return

    config.agent ??= {}
    for (const [agent, model] of overrides) {
      config.agent[agent] = {
        ...config.agent[agent],
        model,
      }
    }
  },
})

const plugin: PluginModule = {
  id: "opencode-runtime-triage.server",
  server,
}

export default plugin
