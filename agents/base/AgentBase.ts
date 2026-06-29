import type {
  AgentContext,
  AgentExecutionResult,
  JsonObject,
  SchemaDefinition,
  ValidationResult,
} from "../types";

export abstract class AgentBase<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: SchemaDefinition;
  abstract readonly outputSchema: SchemaDefinition;

  constructor(
    protected readonly provider: {
      complete: (request: {
        prompt: string;
        systemPrompt?: string;
        context?: JsonObject;
      }) => Promise<{ text: string; structuredData?: JsonObject }>;
    } = {
      complete: async () => ({ text: "" }),
    }
  ) {}

  abstract execute(
    input: TInput,
    context?: AgentContext
  ): Promise<AgentExecutionResult<TOutput>>;

  validate(input: TInput, output: TOutput): ValidationResult {
    const issues: string[] = [];
    const inputRecord = this.toRecord(input);
    const outputRecord = this.toRecord(output);

    for (const key of this.inputSchema.required ?? []) {
      if (!(key in inputRecord)) {
        issues.push(`Missing required input field: ${key}`);
      }
    }

    for (const key of this.outputSchema.required ?? []) {
      if (!(key in outputRecord)) {
        issues.push(`Missing required output field: ${key}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  async retry(
    input: TInput,
    context?: AgentContext
  ): Promise<AgentExecutionResult<TOutput>> {
    return this.execute(input, context);
  }

  protected toRecord(value: unknown): JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : {};
  }

  protected toTimestamp(): string {
    return new Date().toISOString();
  }
}
