import type { RetryPolicy, PipelineStep } from "./pipelineTypes";
export declare const defaultRetryPolicy: RetryPolicy;
export declare function shouldRetry(step: PipelineStep, policy?: RetryPolicy): boolean;
export declare function nextRetryDelay(step: PipelineStep, policy?: RetryPolicy): number;
export declare function incrementRetry(step: PipelineStep): PipelineStep;
/**
 * Retry Policy Executor with exponential backoff
 * Handles failed pipeline stages with intelligent retry logic
 */
export declare class RetryPolicyExecutor {
    private policy;
    constructor(policy?: RetryPolicy);
    executeWithRetry<T>(fn: () => Promise<T>, context?: {
        stepName?: string;
        attempt?: number;
    }): Promise<T>;
    /**
     * Calculate exponential backoff with jitter
     */
    private calculateBackoff;
    /**
     * Determine if a step should be retried
     */
    shouldRetry(error: unknown, attemptNumber: number): boolean;
    getPolicy(): RetryPolicy;
    setPolicy(policy: Partial<RetryPolicy>): void;
}
/**
 * Retry tracker for monitoring retry attempts
 */
export declare class RetryTracker {
    private attempts;
    private errors;
    recordAttempt(stepId: string): number;
    recordError(stepId: string, error: Error): void;
    getAttempts(stepId: string): number;
    getErrors(stepId: string): Error[];
    reset(stepId: string): void;
    clear(): void;
    getStats(): {
        totalSteps: number;
        totalAttempts: number;
        failedSteps: number;
    };
}
