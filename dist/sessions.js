import { modelKey } from "./model.js";
// OpenCode serializes an omitted variant as "default" after switchModel.
const selectionKey = (model) => modelKey({ ...model, variant: model.variant === "default" ? undefined : model.variant });
// Agent transforms do not replace a session's selected model. Keep the previous
// selection so releasing a runtime layer can undo only changes that we still own.
export class RuntimeSessions {
    ctx;
    selected = new Map();
    constructor(ctx) {
        this.ctx = ctx;
    }
    async check(sessionID) {
        const session = await this.ctx.session.get({ sessionID });
        if (session.location.directory !== this.ctx.location.directory)
            throw new Error("Session belongs to another location");
        return session;
    }
    async sync(models, sessionID) {
        const ids = new Set(this.selected.keys());
        if (sessionID)
            ids.add(sessionID);
        for (const id of ids) {
            const session = await this.ctx.session.get({ sessionID: id }).catch((error) => {
                if (id !== sessionID && error && typeof error === "object" && "_tag" in error && error._tag === "SessionNotFoundError")
                    return undefined;
                throw error;
            });
            if (!session || session.location.directory !== this.ctx.location.directory) {
                this.selected.delete(id);
                if (id === sessionID)
                    throw new Error("Session belongs to another location");
                continue;
            }
            let previous = this.selected.get(id);
            // A manual model selection supersedes our saved selection.
            if (previous && (!session.model || selectionKey(session.model) !== selectionKey(previous.applied))) {
                this.selected.delete(id);
                previous = undefined;
                if (id !== sessionID)
                    continue;
            }
            const target = session.agent ? models.get(session.agent) : undefined;
            if (!target) {
                if (previous) {
                    await this.ctx.session.switchModel({ sessionID: id, model: previous.original });
                    this.selected.delete(id);
                }
                continue;
            }
            const original = previous?.original ?? session.model ?? (await this.ctx.model.default()).data;
            if (!original)
                throw new Error("No default model is available to restore this session");
            if (!session.model || selectionKey(session.model) !== selectionKey(target)) {
                await this.ctx.session.switchModel({ sessionID: id, model: target });
                this.selected.set(id, { original: { providerID: original.providerID, id: original.id, ...("variant" in original ? { variant: original.variant } : {}) }, applied: { ...target } });
            }
        }
    }
}
