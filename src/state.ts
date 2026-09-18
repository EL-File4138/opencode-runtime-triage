import type { ModelRef } from "./model.js"

// Each TUI owns its own layer. The most recent selection for an agent wins.
export class RuntimeState {
  private owners = new Map<string, { expires: number; models: Map<string, { model: ModelRef; order: number }> }>()
  private order = 0
  constructor(private readonly now = Date.now, private readonly ttl = 90_000) {}
  checkpoint() {
    const snapshot = structuredClone(this.owners)
    return () => { this.owners = snapshot }
  }
  touch(owner: string) {
    const state = this.owners.get(owner) ?? { expires: 0, models: new Map() }
    state.expires = this.now() + this.ttl
    this.owners.set(owner, state)
    return state
  }
  set(owner: string, changes: readonly { agent: string; model: ModelRef | null }[], persistent = false) {
    const state = this.touch(owner)
    if (persistent) state.expires = Infinity
    for (const { agent, model } of changes) {
      if (model) state.models.set(agent, { model: { ...model }, order: ++this.order })
      else state.models.delete(agent)
    }
  }
  release(owner: string) { return this.owners.delete(owner) }
  expire() {
    let changed = false
    for (const [owner, state] of this.owners) {
      if (state.expires <= this.now()) { this.owners.delete(owner); changed = true }
    }
    return changed
  }
  models() {
    const result = new Map<string, { model: ModelRef; order: number }>()
    for (const state of this.owners.values()) for (const [agent, value] of state.models) {
      if ((result.get(agent)?.order ?? -1) < value.order) result.set(agent, value)
    }
    return new Map([...result].map(([agent, value]) => [agent, value.model]))
  }
}
