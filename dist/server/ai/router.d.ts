export type AIProviderConfig = Record<string, unknown>;
export declare class AIRouter {
    route(_config: AIProviderConfig): Promise<unknown>;
}
