import { expect, test } from "bun:test"
import type { OpenCodeClient } from "@opencode/client"
import { RuntimeForms } from "../src/forms.js"

test("forms apply answers once, ignore cancellation, and cancel on unload", async () => {
  let status: "answered" | "cancelled" | "pending" = "answered"
  let applied = 0
  let cancelled = 0
  const client = { session: { form: {
    create: async () => ({ id: "form_test" }),
    get: async () => ({ state: { status, answer: { agent: "build", model: "a/b" } } }),
    cancel: async () => { cancelled++ },
  } } } as unknown as OpenCodeClient
  const forms = new RuntimeForms(async () => client)
  const input = { sessionID: "ses_test", title: "Select", fields: [{ key: "agent", type: "string" as const }] as [{ key: string; type: "string" }] }
  await forms.open(input, async (answer) => { expect(answer.model).toBe("a/b"); applied++ })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(applied).toBe(1)
  status = "cancelled"
  await forms.open(input, async () => { applied++ })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(applied).toBe(1)
  status = "pending"
  await forms.open(input, async () => { applied++ })
  await expect(forms.open(input, async () => {})).rejects.toThrow("already open")
  await forms.close()
  expect(cancelled).toBe(1)
  expect(applied).toBe(1)
})
