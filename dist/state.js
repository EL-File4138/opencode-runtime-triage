import { createHash } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync, } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const stateFile = (directory) => {
    const id = createHash("sha256").update(directory).digest("hex").slice(0, 16);
    const uid = typeof process.getuid === "function" ? process.getuid() : "user";
    return join(tmpdir(), `opencode-runtime-triage-${uid}-${id}.json`);
};
const processIsRunning = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
};
const readState = (directory) => {
    const file = stateFile(directory);
    try {
        const value = JSON.parse(readFileSync(file, "utf8"));
        if (!Number.isInteger(value.ownerPid) ||
            !value.models ||
            typeof value.models !== "object") {
            unlinkSync(file);
            return undefined;
        }
        if (!processIsRunning(value.ownerPid)) {
            unlinkSync(file);
            return undefined;
        }
        return value;
    }
    catch {
        return undefined;
    }
};
const writeState = (directory, state) => {
    const file = stateFile(directory);
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    renameSync(temporary, file);
};
export const getRuntimeModels = (directory) => {
    const state = readState(directory);
    return state ? new Map(Object.entries(state.models)) : undefined;
};
export const setRuntimeModel = (directory, agent, model) => {
    const models = getRuntimeModels(directory) ?? new Map();
    const previous = models.get(agent);
    models.set(agent, model);
    writeState(directory, {
        ownerPid: process.pid,
        models: Object.fromEntries(models),
    });
    return previous;
};
export const restoreRuntimeModel = (directory, agent, model) => {
    const models = getRuntimeModels(directory);
    if (!models)
        return;
    if (model === undefined)
        models.delete(agent);
    else
        models.set(agent, model);
    if (models.size === 0) {
        clearRuntimeModels(directory);
        return;
    }
    writeState(directory, {
        ownerPid: process.pid,
        models: Object.fromEntries(models),
    });
};
export const clearRuntimeModels = (directory) => {
    try {
        unlinkSync(stateFile(directory));
    }
    catch {
        // The runtime state is already clear.
    }
};
