import { expect, test } from "bun:test"
import type { Plugin } from "@opencode/plugin"
import { RuntimeSessions } from "../src/sessions.js"
import type { ModelRef } from "../src/model.js"

test("session overrides restore the original selection across layers and agent changes", async () => {
  const original = { providerID: "a", id: "original", variant: "high" }
  const first = { providerID: "b", id: "first" }
  const second = { providerID: "c", id: "second" }
  const session: { agent: string; model?: ModelRef; location: { directory: string } } = {
    agent: "build", model: original, location: { directory: "/test" },
  }
  let fail = false
  const ctx = {
    location: session.location,
    session: {
      get: async () => structuredClone(session),
      switchModel: async ({ model }: { model: ModelRef }) => {
        if (fail) { fail = false; throw new Error("switch failed") }
        session.model = { ...model, variant: model.variant ?? "default" }
      },
    },
    model: { default: async () => ({ data: original }) },
  }
  const runtime = new RuntimeSessions(ctx as unknown as Plugin.Context)
  await runtime.sync(new Map([["build", first]]), "ses_test")
  await runtime.sync(new Map([["build", second]]))
  expect(session.model).toEqual({ ...second, variant: "default" })
  await runtime.sync(new Map([["build", first]]))
  expect(session.model).toEqual({ ...first, variant: "default" })
  session.agent = "plan"
  await runtime.sync(new Map([["build", first]]), "ses_test")
  expect(session.model).toEqual(original)
  session.agent = "build"
  fail = true
  await expect(runtime.sync(new Map([["build", first]]), "ses_test")).rejects.toThrow("switch failed")
  await runtime.sync(new Map())
  expect(session.model).toEqual(original)
  delete session.model
  await runtime.sync(new Map([["build", first]]), "ses_test")
  await runtime.sync(new Map())
  expect(session.model as ModelRef | undefined).toEqual(original)
  session.location = { directory: "/other" }
  await expect(runtime.check("ses_test")).rejects.toThrow("another location")
})
