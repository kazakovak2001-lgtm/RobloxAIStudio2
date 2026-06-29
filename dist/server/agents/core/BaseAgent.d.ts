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
export declare abstract class BaseAgent {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly inputSchema: Record<string, unknown>;
    abstract readonly outputSchema: Record<string, unknown>;
    protected maxRetries: number;
    protected timeout: number;
    protected llm?: {
        generate(prompt: string, options?: LLMOptions): Promise<string>;
    };
    constructor(_config?: Partial<AgentConfig>);
    execute(input: AgentInput): Promise<AgentResult<AgentOutput>>;
    retry(input: AgentInput, _error?: string): Promise<AgentResult<AgentOutput>>;
    protected abstract process(input: AgentInput): Promise<Record<string, unknown>>;
    protected delay(ms: number): Promise<void>;
}
