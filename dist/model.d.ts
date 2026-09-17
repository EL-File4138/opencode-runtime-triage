export type ModelRef = {
    providerID: string;
    id: string;
    variant?: string;
};
export declare const modelKey: (model: ModelRef) => string;
export declare const matchingProviderOverrides: (agents: readonly {
    id: string;
    model?: ModelRef;
}[], source: string, target: string, models: readonly {
    providerID: string;
    id: string;
    variants: readonly {
        id: string;
    }[];
}[]) => {
    agent: string;
    model: {
        providerID: string;
        id: string;
        variant?: string;
    };
}[];
