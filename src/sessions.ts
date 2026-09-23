import type { Plugin } from "@opencode/plugin"
import { modelKey, type ModelRef } from "./model.js"

// OpenCode serializes an omitted variant as "default" after switchModel.
const selectionKey = (model: ModelRef) => modelKey({ ...model, variant: model.variant === "default" ? undefined : model.variant })

// Agent transforms do not replace a session's selected model. Keep the previous
// selection so releasing a runtime layer can undo only changes that we still own.
export class RuntimeSessions {
  private selected = new Map<string, { original: ModelRef; applied: ModelRef }>()
  private manual = new Map<string, string>()
  constructor(private readonly ctx: Plugin.Context) {}

  async check(sessionID: string) {
    const session = await this.ctx.session.get({ sessionID })
    if (session.location.directory !== this.ctx.location.directory) throw new Error("Session belongs to another location")
    return session
  }

  async sync(models: ReadonlyMap<string, ModelRef>, sessionID?: string, force = false) {
    if (force && sessionID) this.manual.delete(sessionID)
    const ids = new Set(this.selected.keys())
    for (const id of this.manual.keys()) ids.add(id)
    if (sessionID) ids.add(sessionID)
    for (const id of ids) {
      const session = await this.ctx.session.get({ sessionID: id }).catch((error: unknown) => {
        if (id !== sessionID && error && typeof error === "object" && "_tag" in error && error._tag === "SessionNotFoundError") return undefined
        throw error
      })
      if (!session || session.location.directory !== this.ctx.location.directory) {
        this.selected.delete(id)
        if (id === sessionID) throw new Error("Session belongs to another location")
        continue
      }
      let previous = this.selected.get(id)
      // A manual model selection supersedes our saved selection.
      if (previous && (!session.model || selectionKey(session.model) !== selectionKey(previous.applied))) {
        this.selected.delete(id)
        previous = undefined
        if (session.model) this.manual.set(id, selectionKey(session.model))
        continue
      }
      // Keep a manual /models choice until an explicit runtime command forces a new override.
      const manual = this.manual.get(id)
      if (manual) {
        if (session.model && selectionKey(session.model) !== manual) this.manual.set(id, selectionKey(session.model))
        continue
      }
      const target = session.agent ? models.get(session.agent) : undefined
      if (!target) {
        if (previous) {
          await this.ctx.session.switchModel({ sessionID: id, model: previous.original })
          this.selected.delete(id)
        }
        continue
      }
      const original = previous?.original ?? session.model ?? (await this.ctx.model.default()).data
      if (!original) throw new Error("No default model is available to restore this session")
      if (!session.model || selectionKey(session.model) !== selectionKey(target)) {
        await this.ctx.session.switchModel({ sessionID: id, model: target })
        this.selected.set(id, { original: { providerID: original.providerID, id: original.id, ...("variant" in original ? { variant: original.variant } : {}) }, applied: { ...target } })
      }
    }
  }
}
