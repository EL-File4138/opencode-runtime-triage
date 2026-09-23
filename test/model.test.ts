import { expect, test } from "bun:test"
import { matchingProviderOverrides, modelKey } from "../src/model.js"
import { RuntimeState } from "../src/state.js"

test("model references retain slashes and variants", () => {
  expect(modelKey({ providerID: "p", id: "family/model", variant: "high" })).toBe("p/family/model#high")
})
test("provider replacement requires matching model and variant", () => {
  const agents = [
    { id: "build", model: { providerID: "a", id: "m", variant: "high" } },
    { id: "other", model: { providerID: "b", id: "m" } },
    { id: "missing", model: { providerID: "a", id: "missing" } },
  ]
  expect(matchingProviderOverrides(agents, "a", "b", [{ providerID: "b", id: "m", variants: [] }])).toEqual([])
  expect(matchingProviderOverrides(agents, "a", "b", [{ providerID: "b", id: "m", variants: [{ id: "high" }] }])).toEqual([
    { agent: "build", model: { providerID: "b", id: "m", variant: "high" } },
  ])
})
test("releasing one terminal reveals another terminal's override", () => {
  const state = new RuntimeState()
  state.set("one", [{ agent: "build", model: { providerID: "a", id: "one" } }])
  state.set("two", [{ agent: "build", model: { providerID: "a", id: "two" } }])
  expect(state.models().get("build")?.id).toBe("two")
  state.release("two")
  expect(state.models().get("build")?.id).toBe("one")
  state.set("one", [{ agent: "build", model: null }])
  expect(state.models().size).toBe(0)
})
test("lease expiry clears crashed terminals and heartbeat retains live ones", () => {
  let now = 0
  const state = new RuntimeState(() => now, 100)
  state.set("dead", [{ agent: "build", model: { providerID: "a", id: "one" } }])
  state.set("live", [{ agent: "plan", model: { providerID: "a", id: "two" } }])
  now = 80; state.touch("live"); now = 100
  expect(state.expire()).toBe(true)
  expect([...state.models().keys()]).toEqual(["plan"])
})
