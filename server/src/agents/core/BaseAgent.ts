export interface AgentConfig {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  maxRetries?: number;
  timeout?: number;
}

export interface AgentInput {
  [key: string]: unknown;
}

export interface AgentOutput {
  [key: string]: unknown;
}

export interface AgentResult<T = AgentOutput> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  duration: number;
  timestamp: Date;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export abstract class BaseAgent {
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly inputSchema: Record<string, unknown>;
  public abstract readonly outputSchema: Record<string, unknown>;

  protected maxRetries = 3;
  protected timeout = 30000;
  protected llm?: {
    generate(prompt: string, options?: LLMOptions): Promise<string>;
  };

  constructor(config?: Partial<AgentConfig>) {
    if (config?.maxRetries) this.maxRetries = config.maxRetries;
    if (config?.timeout) this.timeout = config.timeout;
  }

  async execute(input: AgentInput): Promise<AgentResult<AgentOutput>> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.maxRetries) {
      attempts++;
      try {
        const data = await this.process(input);
        return {
          success: true,
          data: data as AgentOutput,
          attempts,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempts < this.maxRetries) {
          await this.delay(1000 * attempts);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || "Unknown error",
      attempts,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  async retry(input: AgentInput, _error?: string): Promise<AgentResult<AgentOutput>> {
    return this.execute(input);
  }

  protected abstract process(input: AgentInput): Promise<Record<string, unknown>>;

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
