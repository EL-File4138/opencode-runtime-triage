import { z } from "zod";
export declare const Runtime: {
    readonly id: "runtime-triage";
    readonly events: {};
    readonly methods: {
        readonly instance: {
            readonly output: z.ZodString;
            readonly input: z.ZodObject<{}, z.core.$strip>;
        };
        readonly apply: {
            readonly output: z.ZodNull;
            readonly input: z.ZodObject<{
                owner: z.ZodString;
                sessionID: z.ZodOptional<z.ZodString>;
                changes: z.ZodArray<z.ZodObject<{
                    agent: z.ZodString;
                    model: z.ZodNullable<z.ZodObject<{
                        providerID: z.ZodString;
                        id: z.ZodString;
                        variant: z.ZodOptional<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        };
        readonly heartbeat: {
            readonly output: z.ZodNull;
            readonly input: z.ZodObject<{
                owner: z.ZodString;
            }, z.core.$strip>;
        };
        readonly release: {
            readonly output: z.ZodNull;
            readonly input: z.ZodObject<{
                owner: z.ZodString;
            }, z.core.$strip>;
        };
    };
};
