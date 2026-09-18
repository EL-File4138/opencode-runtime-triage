import { expect, test } from "bun:test"
import plugin from "../src/server.js"
import type { Plugin } from "@opencode/plugin"

// Exercise the actual registered RPC handlers and replay the agent transform.
test("RPC validates whole batches, applies variants, restores and rolls back reload failures", async () => {
  let transform: any
  let handlers: any
  let fail = false
  let failSwitch = false
  let promptHook: any
  const commands = new Map<string, any>()
  const session = { agent: "build", location: { directory: "/test" }, model: { providerID: "source", id: "original" } }
  const base = { id: "build", model: { providerID: "source", id: "original" } }
  let agents: any[] = [structuredClone(base)]
  const context = {
    location: { directory: "/test" },
    session: {
      get: async () => structuredClone(session),
      switchModel: async ({ model }: any) => {
        if (failSwitch) { failSwitch = false; throw new Error("switch failure") }
        session.model = model
      },
      hook: async (_name: string, callback: any) => { promptHook = callback },
    },
    command: { transform: async (callback: any) => callback({ add: (command: any) => commands.set(command.name, command) }) },
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
    await handlers.apply({ owner: "one", sessionID: "session", changes: [change] })
    expect(agents[0].model).toEqual(change.model)
    expect(session.model).toEqual(change.model)
    await handlers.release({ owner: "one" })
    expect(agents[0]).toEqual(base)
    expect(session.model).toEqual(base.model)
    failSwitch = true
    await expect(handlers.apply({ owner: "one", sessionID: "session", changes: [change] })).rejects.toThrow("switch failure")
    expect(agents[0]).toEqual(base)
    expect(session.model).toEqual(base.model)
    fail = true
    await expect(handlers.apply({ owner: "one", changes: [change] })).rejects.toThrow("reload failure")
    expect(agents[0]).toEqual(base)
    await expect(handlers.apply({ owner: "one", changes: [{ ...change, model: { ...change.model, variant: "missing" } }] })).rejects.toThrow("Unavailable model")
    await commands.get("rt-model").execute({ sessionID: "session", prompt: { text: "build target/model#high" } })
    expect(session.model).toEqual(change.model)
    await commands.get("rt-model").execute({ sessionID: "session", prompt: { text: "build restore" } })
    expect(session.model).toEqual(base.model)
    await handlers.apply({ owner: "one", changes: [change] })
    await promptHook({ sessionID: "session" })
    expect(session.model).toEqual(change.model)
    session.model = { providerID: "manual", id: "chosen" }
    await handlers.release({ owner: "one" })
    expect(session.model).toEqual({ providerID: "manual", id: "chosen" })
  } finally { if (cleanup) await cleanup() }
})
