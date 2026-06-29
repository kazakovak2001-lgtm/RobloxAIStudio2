import type { AgentResult, AgentInput, AgentOutput } from "../agents/core/BaseAgent";
export interface PipelineRunnerOptions {
    agentService: {
        executeAgent(agentType: string, input: Record<string, unknown>): Promise<unknown>;
    };
}
export declare class PipelineRunner {
    constructor(_options: PipelineRunnerOptions);
    runPipeline(input: AgentInput): Promise<AgentResult<AgentOutput>>;
}
