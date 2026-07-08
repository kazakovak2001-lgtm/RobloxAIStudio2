/**
 * ExecutionPolicy — Rules governing agent execution.
 */

export interface ExecutionPolicyConfig {
  maxConcurrentAgents: number;
  globalTimeoutMs: number;
  requireContextValidation: boolean;
  requireOutputValidation: boolean;
  allowRetryOnFailure: boolean;
}

export const DEFAULT_POLICY: ExecutionPolicyConfig = {
  maxConcurrentAgents: 1,
  globalTimeoutMs: 300000,
  requireContextValidation: true,
  requireOutputValidation: true,
  allowRetryOnFailure: true,
};

export class ExecutionPolicy {
  private config: ExecutionPolicyConfig;

  constructor(config?: Partial<ExecutionPolicyConfig>) {
    this.config = { ...DEFAULT_POLICY, ...config };
  }

  get requireContextValidation(): boolean {
    return this.config.requireContextValidation;
  }
  get requireOutputValidation(): boolean {
    return this.config.requireOutputValidation;
  }
  get allowRetry(): boolean {
    return this.config.allowRetryOnFailure;
  }
  get globalTimeout(): number {
    return this.config.globalTimeoutMs;
  }
  get maxConcurrent(): number {
    return this.config.maxConcurrentAgents;
  }

  getConfig(): Readonly<ExecutionPolicyConfig> {
    return this.config;
  }
}
