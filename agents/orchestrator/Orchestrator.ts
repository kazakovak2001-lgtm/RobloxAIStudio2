import { AgentBase } from "../base/AgentBase";
import type {
  AgentContext,
  AgentExecutionResult,
  OrchestratorLogEntry,
  PipelineResult,
  ValidationResult,
} from "../types";

export interface OrchestratorOptions {
  stopOnError?: boolean;
  maxRetries?: number;
}

export class Orchestrator<TInput = unknown, TOutput = unknown> {
  private readonly logs: OrchestratorLogEntry[] = [];

  constructor(
    private readonly agents: AgentBase<any, any>[],
    private readonly options: OrchestratorOptions = {}
  ) {}

  async runPipeline(
    input: TInput,
    contextOverrides: Partial<AgentContext> = {}
  ): Promise<PipelineResult<TOutput>> {
    const context: AgentContext = {
      prompt: typeof input === "string" ? input : JSON.stringify(input),
      sharedState: {},
      artifacts: {},
      previousOutputs: {},
      metadata: {},
      ...contextOverrides,
    };

    const results: AgentExecutionResult<TOutput>[] = [];
    let failedAgent: string | null = null;

    for (const agent of this.agents) {
      this.log(agent.name, "started", `Starting ${agent.name}`);
      const startedAt = Date.now();

      try {
        const result = await agent.execute(input, context);
        const durationMs = Date.now() - startedAt;
        const validation =
          result.validation ?? this.buildFallbackValidation(result.output);

        if (!validation.valid) {
          this.log(agent.name, "failed", validation.issues.join(", "));
          failedAgent = agent.name;
          if (this.options.stopOnError !== false) {
            break;
          }
        }

        if (!result.success) {
          this.log(
            agent.name,
            "failed",
            result.error ?? "Agent returned no success state"
          );
          failedAgent = agent.name;
          if (this.options.stopOnError !== false) {
            break;
          }
        }

        context.previousOutputs[agent.name] = result.output ?? {};
        context.sharedState[agent.name] = result.output ?? {};
        results.push({ ...result, durationMs, validation });
        this.log(agent.name, "succeeded", `Completed ${agent.name}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown orchestrator error";
        this.log(agent.name, "failed", message);
        failedAgent = agent.name;
        if (this.options.stopOnError !== false) {
          break;
        }
      }
    }

    return {
      success: failedAgent === null,
      context,
      results,
      logs: this.logs,
    };
  }

  async retryAgent(
    agentName: string,
    input: TInput,
    context: AgentContext
  ): Promise<AgentExecutionResult<TOutput>> {
    const agent = this.agents.find((candidate) => candidate.name === agentName);
    if (!agent) {
      throw new Error(
        `Agent ${agentName} was not registered with the orchestrator.`
      );
    }

    this.log(agentName, "retried", `Retrying ${agentName}`);
    return agent.retry(input, context);
  }

  private log(
    agentName: string,
    status: OrchestratorLogEntry["status"],
    message: string
  ): void {
    this.logs.push({
      agentName,
      status,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private buildFallbackValidation(
    output: TOutput | undefined
  ): ValidationResult {
    if (output === undefined) {
      return { valid: false, issues: ["No output was produced."] };
    }
    return { valid: true, issues: [] };
  }
}
