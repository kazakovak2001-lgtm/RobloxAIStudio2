import type { StepExecutionContext, PipelineStep, PipelineEventHandler } from "./pipelineTypes";
import { defaultRetryPolicy } from "./retryPolicy";
type AIManager = {
    generate(providerId: string, prompt: string, options?: Record<string, unknown>): Promise<{
        response: {
            content: string;
        };
        provider: string;
        model: string;
    }>;
    resolveProvider(agentType: string): Promise<{
        providerId: string;
        model: string;
    }>;
};
type AgentService = {
    executeAgent(agentType: string, input: Record<string, unknown>): Promise<unknown>;
};
type Persistence = {
    saveRun?(runId: string, stepId: string, data: unknown): Promise<void>;
};
export interface StepRunnerOptions {
    aiManager: AIManager;
    agentService: AgentService;
    persistence?: Persistence;
    policy?: ReturnType<typeof defaultRetryPolicy>;
    onEvent?: PipelineEventHandler;
}
export declare class StepRunner {
    private agents;
    private persistence?;
    private policy;
    private eventBus;
    constructor(options: StepRunnerOptions);
    onEvent(handler: PipelineEventHandler): () => boolean;
    executeStep(context: StepExecutionContext): Promise<PipelineStep>;
    private runWithRetry;
    private invokeAgent;
    private persistIfPossible;
    private sleep;
    private emit;
}
export {};
