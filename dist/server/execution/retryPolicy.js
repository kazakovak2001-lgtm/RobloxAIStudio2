export const defaultRetryPolicy = {
    maxRetries: 3,
    backoffMs: 500,
    backoffMultiplier: 2,
    onFailure: "continue",
};
export function shouldRetry(step, policy = defaultRetryPolicy) {
    if (step.status === "cancelled" || step.status === "skipped")
        return false;
    if (step.status === "completed")
        return false;
    return ((step.retryCount ?? 0) <
        (policy.maxRetries ?? defaultRetryPolicy.maxRetries));
}
export function nextRetryDelay(step, policy = defaultRetryPolicy) {
    const retries = step.retryCount ?? 0;
    const base = policy.backoffMs ?? defaultRetryPolicy.backoffMs;
    const multiplier = policy.backoffMultiplier ?? defaultRetryPolicy.backoffMultiplier;
    return Math.round(base * Math.pow(multiplier, retries));
}
export function incrementRetry(step) {
    return {
        ...step,
        retryCount: (step.retryCount ?? 0) + 1,
        status: "pending",
        error: undefined,
    };
}
/**
 * Retry Policy Executor with exponential backoff
 * Handles failed pipeline stages with intelligent retry logic
 */
export class RetryPolicyExecutor {
    constructor(policy = defaultRetryPolicy) {
        this.policy = policy;
    }
    async executeWithRetry(fn, context) {
        let lastError = null;
        for (let attempt = 0; attempt <= this.policy.maxRetries; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                const stepName = context?.stepName ?? "unknown";
                if (attempt === this.policy.maxRetries) {
                    // Final attempt failed
                    throw new Error(`Step ${stepName} failed after ${this.policy.maxRetries} retries: ${lastError.message}`);
                }
                // Calculate backoff
                const backoffMs = this.calculateBackoff(attempt);
                console.warn(`Step ${stepName} failed (attempt ${attempt + 1}/${this.policy.maxRetries + 1}), ` +
                    `retrying in ${backoffMs}ms: ${lastError.message}`);
                // Wait before retry
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
        }
        throw lastError ?? new Error("Unknown retry error");
    }
    /**
     * Calculate exponential backoff with jitter
     */
    calculateBackoff(attempt) {
        const base = this.policy.backoffMs * Math.pow(this.policy.backoffMultiplier, attempt);
        // Add jitter: ±10%
        const jitter = base * 0.1 * (Math.random() * 2 - 1);
        return Math.max(0, base + jitter);
    }
    /**
     * Determine if a step should be retried
     */
    shouldRetry(error, attemptNumber) {
        if (attemptNumber >= this.policy.maxRetries) {
            return false;
        }
        // Retry on all errors except cancellation
        if (error instanceof Error) {
            if (error.message.includes("cancelled") ||
                error.message.includes("Cancelled")) {
                return false;
            }
        }
        return true;
    }
    getPolicy() {
        return this.policy;
    }
    setPolicy(policy) {
        this.policy = {
            ...this.policy,
            ...policy,
        };
    }
}
/**
 * Retry tracker for monitoring retry attempts
 */
export class RetryTracker {
    constructor() {
        this.attempts = new Map();
        this.errors = new Map();
    }
    recordAttempt(stepId) {
        const count = (this.attempts.get(stepId) ?? 0) + 1;
        this.attempts.set(stepId, count);
        return count;
    }
    recordError(stepId, error) {
        const errorList = this.errors.get(stepId) ?? [];
        errorList.push(error);
        this.errors.set(stepId, errorList);
    }
    getAttempts(stepId) {
        return this.attempts.get(stepId) ?? 0;
    }
    getErrors(stepId) {
        return this.errors.get(stepId) ?? [];
    }
    reset(stepId) {
        this.attempts.delete(stepId);
        this.errors.delete(stepId);
    }
    clear() {
        this.attempts.clear();
        this.errors.clear();
    }
    getStats() {
        return {
            totalSteps: this.attempts.size,
            totalAttempts: Array.from(this.attempts.values()).reduce((sum, a) => sum + a, 0),
            failedSteps: this.errors.size,
        };
    }
}
