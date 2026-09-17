import { Plugin, Model, Provider } from "@opencode/plugin"
import { Runtime } from "./rpc.js"
import { RuntimeState } from "./state.js"

export default Plugin.define({
  id: "opencode-runtime-triage.server",
  async setup(ctx) {
    const state = new RuntimeState()
    const transform = () => ctx.agent.transform((editor) => {
      for (const [id, model] of state.models()) editor.update(id, (agent) => { agent.model = { ...model, id: Model.ID.make(model.id), providerID: Provider.ID.make(model.providerID), variant: model.variant ? Model.VariantID.make(model.variant) : undefined } })
    })
    let registration: Awaited<ReturnType<typeof transform>> | undefined
    // Serialize mutations so a bulk change and a lease expiry cannot interleave.
    let pending = Promise.resolve()
    const serial = <T>(action: () => Promise<T>) => {
      const next = pending.then(action)
      pending = next.then(() => {}, () => {})
      return next
    }
    await ctx.rpc.register(Runtime, {
      apply: (input) => serial(async () => {
        const [agents, models] = await Promise.all([ctx.agent.list(), ctx.model.list()])
        for (const change of input.changes) {
          if (!agents.data.some((agent) => agent.id === change.agent)) throw new Error(`Unknown agent: ${change.agent}`)
          const ref = change.model
          if (ref && !models.data.some((model) => model.providerID === ref.providerID && model.id === ref.id && (!ref.variant || model.variants.some((v) => v.id === ref.variant)))) {
            throw new Error(`Unavailable model: ${ref.providerID}/${ref.id}`)
          }
        }
        const rollback = state.checkpoint()
        state.set(input.owner, input.changes)
        try {
          // Register after startup's agent sources so configured models cannot
          // overwrite runtime selections during registry replay.
          if (!registration) registration = await transform()
          await ctx.agent.reload()
        } catch (error) {
          rollback()
          await ctx.agent.reload()
          throw error
        }
        return null
      }),
      heartbeat: (input) => serial(async () => {
        if (state.expire()) await ctx.agent.reload()
        state.touch(input.owner)
        return null
      }),
      release: (input) => serial(async () => {
        if (state.release(input.owner)) await ctx.agent.reload()
        return null
      }),
    })
    const timer = setInterval(() => {
      void serial(async () => { if (state.expire()) await ctx.agent.reload() }).catch(console.error)
    }, 15_000)
    return () => clearInterval(timer)
  },
})
