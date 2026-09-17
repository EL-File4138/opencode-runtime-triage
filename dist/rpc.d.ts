import { z } from "zod";
export declare const Runtime: {
    readonly id: "runtime-triage";
    readonly events: {};
    readonly methods: {
        readonly apply: {
            readonly output: z.ZodNull;
            readonly input: z.ZodObject<{
                owner: z.ZodString;
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
