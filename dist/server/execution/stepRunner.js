import { shouldRetry, incrementRetry, nextRetryDelay, defaultRetryPolicy } from "./retryPolicy";
export class StepRunner {
    constructor(options) {
        this.policy = defaultRetryPolicy;
        this.eventBus = new Set();
        this.agents = options.agentService;
        this.persistence = options.persistence;
        this.policy = options.policy ?? defaultRetryPolicy;
        if (options.onEvent)
            this.eventBus.add(options.onEvent);
    }
    onEvent(handler) {
        this.eventBus.add(handler);
        return () => this.eventBus.delete(handler);
    }
    async executeStep(context) {
        const { step } = context;
        this.emit({ type: "step.started", pipelineId: context.state.pipelineId, stepId: step.id, timestamp: new Date() });
        try {
            const result = await this.runWithRetry(context);
            context.state.markStepCompleted(step.id, result);
            await this.persistIfPossible(step.id, result, context);
            this.emit({ type: "step.completed", pipelineId: context.state.pipelineId, stepId: step.id, data: { output: result }, timestamp: new Date() });
            return { ...step, status: "completed", result, finishedAt: new Date() };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            context.state.markStepFailed(step.id, message);
            await this.persistIfPossible(step.id, { error: message }, context);
            this.emit({ type: "step.failed", pipelineId: context.state.pipelineId, stepId: step.id, data: { error: message }, timestamp: new Date() });
            return { ...step, status: "failed", error: message, finishedAt: new Date() };
        }
    }
    async runWithRetry(context) {
        const { step } = context;
        while (shouldRetry(step, this.policy)) {
            step.retryCount = (step.retryCount ?? 0) + 1;
            try {
                return await this.invokeAgent(context);
            }
            catch (error) {
                const delay = nextRetryDelay(step, this.policy);
                await this.sleep(delay);
                Object.assign(step, incrementRetry(step));
            }
        }
        if ((step.retryCount ?? 0) >= (this.policy.maxRetries ?? defaultRetryPolicy.maxRetries)) {
            throw new Error(step.error ?? "Step failed after retries");
        }
        return this.invokeAgent(context);
    }
    async invokeAgent(context) {
        const { step, previousOutputs } = context;
        const input = { ...(step.input ?? {}), ...previousOutputs };
        try {
            const output = await this.agents.executeAgent(step.agent, input);
            return output;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Agent execution failed";
            Object.assign(step, { error: message, status: "failed", finishedAt: new Date() });
            throw error;
        }
    }
    async persistIfPossible(stepId, data, _context) {
        if (this.persistence?.saveRun) {
            try {
                await this.persistence.saveRun(_context.state.pipelineId, stepId, data);
            }
            catch {
                // ignore persistence errors during execution
            }
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    emit(event) {
        for (const handler of this.eventBus) {
            try {
                Promise.resolve(handler(event)).catch(() => { });
            }
            catch {
                // swallow hook errors
            }
        }
    }
}
