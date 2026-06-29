import type { AgentResult, AgentInput, AgentOutput } from "../types";

export interface PipelineRunnerOptions {
  agentService: {
    executeAgent(agentType: string, input: Record<string, unknown>): Promise<unknown>;
  };
}

export class PipelineRunner {
  private agentService: PipelineRunnerOptions["agentService"];

  constructor(options: PipelineRunnerOptions) {
    this.agentService = options.agentService;
  }

  async runPipeline(input: AgentInput): Promise<AgentResult<AgentOutput>> {
    try {
      const output = await this.agentService.executeAgent("pipeline", input);
      return {
        success: true,
        data: output as AgentOutput,
        attempts: 1,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Pipeline failed",
        attempts: 1,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }
}
