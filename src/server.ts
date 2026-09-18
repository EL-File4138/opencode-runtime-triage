import { Plugin, Model, Provider } from "@opencode/plugin"
import { Runtime } from "./rpc.js"
import { RuntimeState } from "./state.js"
import { RuntimeSessions } from "./sessions.js"
import { matchingProviderOverrides, modelKey, type ModelRef } from "./model.js"

export default Plugin.define({
  id: "opencode-runtime-triage.server",
  async setup(ctx) {
    const state = new RuntimeState()
    const sessions = new RuntimeSessions(ctx)
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
    const apply = async (input: { owner: string; sessionID?: string; changes: { agent: string; model: ModelRef | null }[] }, persistent = false) => {
      if (input.sessionID) await sessions.check(input.sessionID)
      const [agents, models] = await Promise.all([ctx.agent.list(), ctx.model.list()])
      for (const change of input.changes) {
        if (!agents.data.some((agent) => agent.id === change.agent)) throw new Error(`Unknown agent: ${change.agent}`)
        const ref = change.model
        if (ref && !models.data.some((model) => model.providerID === ref.providerID && model.id === ref.id && (!ref.variant || model.variants.some((v) => v.id === ref.variant)))) {
          throw new Error(`Unavailable model: ${ref.providerID}/${ref.id}`)
        }
      }
      const rollback = state.checkpoint()
      state.set(input.owner, input.changes, persistent)
      try {
        // Register after startup's agent sources so configured models cannot
        // overwrite runtime selections during registry replay.
        if (!registration) registration = await transform()
        await ctx.agent.reload()
        await sessions.sync(state.models(), input.sessionID)
      } catch (error) {
        rollback()
        await ctx.agent.reload()
        await sessions.sync(state.models())
        throw error
      }
      return null
    }
    const refresh = async () => {
      await ctx.agent.reload()
      await sessions.sync(state.models())
    }
    await ctx.session.hook("prompt", ({ sessionID }) => serial(async () => {
      await sessions.sync(state.models(), sessionID)
    }))
    await ctx.rpc.register(Runtime, {
      apply: (input) => serial(() => apply(input)),
      heartbeat: (input) => serial(async () => {
        if (state.expire()) await refresh()
        state.touch(input.owner)
        return null
      }),
      release: (input) => serial(async () => {
        if (state.release(input.owner)) await refresh()
        return null
      }),
    })
    const timer = setInterval(() => {
      void serial(async () => { if (state.expire()) await refresh() }).catch(console.error)
    }, 15_000)
    return async () => {
      clearInterval(timer)
      await serial(() => sessions.sync(new Map()))
    }
  },
})
