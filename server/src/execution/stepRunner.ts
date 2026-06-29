import type { StepExecutionContext, PipelineStep, PipelineEvent, PipelineEventHandler } from "./pipelineTypes";
import { shouldRetry, incrementRetry, nextRetryDelay, defaultRetryPolicy } from "./retryPolicy";
import type { RetryPolicy } from "./retryPolicy";

export class PipelineRunner {
  private agents: { executeAgent(agentType: string, input: Record<string, unknown>): Promise<unknown> };
  private persistence?: { saveRun?(runId: string, stepId: string, data: unknown): Promise<void> };
  private policy = defaultRetryPolicy;
  private eventBus = new Set<PipelineEventHandler>();

  constructor(options: {
    agentService: { executeAgent(agentType: string, input: Record<string, unknown>): Promise<unknown> };
    persistence?: { saveRun?(runId: string, stepId: string, data: unknown): Promise<void> };
    policy?: RetryPolicy;
    onEvent?: PipelineEventHandler;
  }) {
    this.agents = options.agentService;
    this.persistence = options.persistence;
    this.policy = options.policy ?? defaultRetryPolicy;
    if (options.onEvent) this.eventBus.add(options.onEvent);
  }

  onEvent(handler: PipelineEventHandler) {
    this.eventBus.add(handler);
    return () => this.eventBus.delete(handler);
  }

  async executeStep(context: StepExecutionContext): Promise<PipelineStep> {
    const { step } = context;
    this.emit({ type: "step.started", pipelineId: context.state.pipelineId, stepId: step.id, timestamp: new Date() });

    try {
      const result = await this.runWithRetry(context);
      context.state.markStepCompleted(step.id, result);
      await this.persistIfPossible(step.id, result, context);
      this.emit({ type: "step.completed", pipelineId: context.state.pipelineId, stepId: step.id, data: { output: result }, timestamp: new Date() });
      return { ...step, status: "completed", result, finishedAt: new Date() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      context.state.markStepFailed(step.id, message);
      await this.persistIfPossible(step.id, { error: message }, context);
      this.emit({ type: "step.failed", pipelineId: context.state.pipelineId, stepId: step.id, data: { error: message }, timestamp: new Date() });
      return { ...step, status: "failed", error: message, finishedAt: new Date() };
    }
  }

  private async runWithRetry(context: StepExecutionContext): Promise<unknown> {
    const { step } = context;
    while (shouldRetry(step, this.policy)) {
      step.retryCount = (step.retryCount ?? 0) + 1;
      try {
        return await this.invokeAgent(context);
      } catch {
        const delay = nextRetryDelay(step, this.policy);
        await this.sleep(delay);
        Object.assign(step, incrementRetry(step));
      }
    }

    if ((step.retryCount ?? 0) >= this.policy.maxRetries) {
      throw new Error(step.error ?? "Step failed after retries");
    }

    return this.invokeAgent(context);
  }

  private async invokeAgent(context: StepExecutionContext): Promise<unknown> {
    const { step, previousOutputs } = context;
    const input = { ...(step.input ?? {}), ...previousOutputs };

    try {
      return await this.agents.executeAgent(step.agent, input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent execution failed";
      Object.assign(step, { error: message, status: "failed", finishedAt: new Date() });
      throw error;
    }
  }

  private async persistIfPossible(stepId: string, data: unknown, context: StepExecutionContext) {
    if (this.persistence?.saveRun) {
      try {
        await this.persistence.saveRun(context.state.pipelineId, stepId, data);
      } catch {
        // ignore persistence errors
      }
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emit(event: PipelineEvent) {
    for (const handler of this.eventBus) {
      try {
        Promise.resolve(handler(event)).catch(() => {});
      } catch {
        // swallow hook errors
      }
    }
  }
}
