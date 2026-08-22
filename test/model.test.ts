import { describe, expect, test } from "bun:test"
import {
  isSelectableModel,
  matchingProviderOverrides,
  splitModel,
} from "../src/model.js"

describe("splitModel", () => {
  test("splits only on the first slash", () => {
    expect(splitModel("provider/family/model")).toEqual({
      provider: "provider",
      model: "family/model",
    })
  })

  test("rejects incomplete identifiers", () => {
    expect(splitModel("provider")).toBeUndefined()
    expect(splitModel("/model")).toBeUndefined()
    expect(splitModel("provider/")).toBeUndefined()
  })
})

describe("isSelectableModel", () => {
  test("allows native OpenCode models without a provider-state entry", () => {
    expect(isSelectableModel("opencode", "gpt-5-nano", undefined)).toBe(true)
  })

  test("requires external models to be present in provider state", () => {
    expect(isSelectableModel("anthropic", "claude-sonnet", undefined)).toBe(
      false,
    )
    expect(
      isSelectableModel("anthropic", "claude-sonnet", {
        "claude-sonnet": {},
      }),
    ).toBe(true)
  })
})

describe("matchingProviderOverrides", () => {
  test("overrides only the source and target model intersection", () => {
    const agents: Array<[string, { model?: string; disable?: boolean }]> = [
      ["build", { model: "source/sol" }],
      ["explore", { model: "source/terra" }],
      ["summary", { model: "source/luna" }],
      ["general", { model: "other/sol" }],
      ["disabled", { model: "source/sol", disable: true }],
    ]

    expect(
      matchingProviderOverrides(
        agents,
        undefined,
        "source",
        "target",
        new Set(["sol", "terra"]),
      ),
    ).toEqual([
      { agent: "build", model: "target/sol" },
      { agent: "explore", model: "target/terra" },
    ])
  })

  test("uses active runtime models when matching", () => {
    const agents: Array<[string, { model?: string }]> = [
      ["build", { model: "configured/sol" }],
    ]

    expect(
      matchingProviderOverrides(
        agents,
        new Map([["build", "source/sol"]]),
        "source",
        "target",
        new Set(["sol"]),
      ),
    ).toEqual([{ agent: "build", model: "target/sol" }])
  })
})
