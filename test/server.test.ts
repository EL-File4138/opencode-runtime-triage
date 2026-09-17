import { expect, test } from "bun:test"
import plugin from "../src/server.js"
import type { Plugin } from "@opencode/plugin"

// Exercise the actual registered RPC handlers and replay the agent transform.
test("RPC validates whole batches, applies variants, restores and rolls back reload failures", async () => {
  let transform: any
  let handlers: any
  let fail = false
  const base = { id: "build", model: { providerID: "source", id: "original" } }
  let agents: any[] = [structuredClone(base)]
  const context = {
    agent: {
      list: async () => ({ data: agents }),
      transform: async (callback: any) => { transform = callback; return { dispose: async () => {} } },
      reload: async () => {
        if (fail) { fail = false; throw new Error("reload failure") }
        agents = [structuredClone(base)]
        transform({ update: (id: string, edit: any) => { const agent = agents.find((a) => a.id === id); if (agent) edit(agent) } })
      },
    },
    model: { list: async () => ({ data: [{ providerID: "target", id: "model", variants: [{ id: "high" }] }] }) },
    rpc: { register: async (_definition: any, value: any) => { handlers = value } },
  }
  const cleanup = await plugin.setup(context as unknown as Plugin.Context)
  // Startup sources must finish before the runtime layer joins replay order.
  expect(transform).toBeUndefined()
  const change = { agent: "build", model: { providerID: "target", id: "model", variant: "high" } }
  try {
    await expect(handlers.apply({ owner: "one", changes: [change, { agent: "missing", model: null }] })).rejects.toThrow("Unknown agent")
    expect(agents[0]).toEqual(base)
    await handlers.apply({ owner: "one", changes: [change] })
    expect(agents[0].model).toEqual(change.model)
    await handlers.release({ owner: "one" })
    expect(agents[0]).toEqual(base)
    fail = true
    await expect(handlers.apply({ owner: "one", changes: [change] })).rejects.toThrow("reload failure")
    expect(agents[0]).toEqual(base)
    await expect(handlers.apply({ owner: "one", changes: [{ ...change, model: { ...change.model, variant: "missing" } }] })).rejects.toThrow("Unavailable model")
  } finally { if (cleanup) await cleanup() }
})
