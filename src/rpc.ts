import { Rpc } from "@opencode/plugin/rpc"
import { z } from "zod"
const model = z.object({ providerID: z.string().min(1), id: z.string().min(1), variant: z.string().min(1).optional() })
const owner = z.object({ owner: z.string().min(1).max(128) })
export const Runtime = Rpc.define({
  id: "runtime-triage",
  events: {},
  methods: {
    instance: { output: z.string(), input: z.object({}) },
    apply: { output: z.null(), input: owner.extend({ sessionID: z.string().min(1).optional(), changes: z.array(z.object({ agent: z.string().min(1), model: model.nullable() })).max(1000) }) },
    heartbeat: { output: z.null(), input: owner },
    release: { output: z.null(), input: owner },
  },
})
