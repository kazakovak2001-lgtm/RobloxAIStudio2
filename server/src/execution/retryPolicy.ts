import type { PipelineStep } from "./pipelineTypes";

export interface RetryPolicy {
  maxRetries: number;
  backoff: "linear" | "exponential";
  initialDelay: number;
  maxDelay: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxRetries: 3,
  backoff: "exponential",
  initialDelay: 1000,
  maxDelay: 10000,
};

export function shouldRetry(step: PipelineStep, policy: RetryPolicy): boolean {
  return step.status === "failed" && (step.retryCount ?? 0) < policy.maxRetries;
}

export function incrementRetry(step: PipelineStep): Partial<PipelineStep> {
  return {
    retryCount: (step.retryCount ?? 0) + 1,
  };
}

export function nextRetryDelay(
  step: PipelineStep,
  policy: RetryPolicy,
): number {
  const attempt = step.retryCount ?? 0;
  const delay =
    policy.backoff === "exponential"
      ? policy.initialDelay * Math.pow(2, attempt)
      : policy.initialDelay * (attempt + 1);

  return Math.min(delay, policy.maxDelay);
}
