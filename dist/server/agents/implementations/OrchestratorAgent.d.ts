import type { AgentInput, AgentOutput, AgentResult, AgentType, LLMProvider, LLMOptions, PipelineContext } from "../../types";
import { BaseAgent } from "../core/BaseAgent";
export declare class OrchestratorAgent extends BaseAgent {
    readonly name = "Orchestrator";
    readonly description = "Coordinates the multi-agent pipeline execution with retry, logging, and error handling.";
    readonly inputSchema: {
        type: string;
        properties: {
            pipeline: {
                type: string;
                items: {
                    type: string;
                };
            };
            input: {
                type: string;
            };
        };
        required: string[];
    };
    readonly outputSchema: {
        type: string;
        properties: {
            pipelineRunId: {
                type: string;
            };
            status: {
                type: string;
            };
            steps: {
                type: string;
                items: {
                    type: string;
                };
            };
            finalOutput: {
                type: string;
            };
        };
        required: string[];
    };
    private pipelineContext;
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(input: AgentInput): Promise<AgentOutput>;
    retryAgent(agentType: AgentType, input: AgentInput): Promise<AgentResult>;
    getPipelineContext(): PipelineContext | null;
}
