import type { LLMProvider, LLMOptions, LLMResponse } from "../types/llm";

/**
 * Mock provider for testing. Returns deterministic responses.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";
  private delay: number;
  private responses: Map<string, string> = new Map();

  constructor(config?: { delay?: number }) {
    this.delay = config?.delay ?? 10;
  }

  /**
   * Pre-program a response for a specific prompt substring.
   */
  setResponse(promptContains: string, response: string): void {
    this.responses.set(promptContains, response);
  }

  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    const result = await this.generateWithMeta(prompt, options);
    return result.content;
  }

  async generateWithMeta(
    prompt: string,
    _options?: LLMOptions,
  ): Promise<LLMResponse> {
    await new Promise((r) => setTimeout(r, this.delay));

    // Check for pre-programmed responses
    for (const [key, value] of this.responses) {
      if (prompt.includes(key))
        return {
          content: value,
          model: "mock",
          tokensUsed: prompt.length / 4,
          finishReason: "complete",
          durationMs: this.delay,
        };
    }

    // Default deterministic response
    const content = JSON.stringify({
      result: "mock-generated",
      promptLength: prompt.length,
      timestamp: Date.now(),
    });
    return {
      content,
      model: "mock",
      tokensUsed: Math.ceil(prompt.length / 4),
      finishReason: "complete",
      durationMs: this.delay,
    };
  }

  async stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    _options?: LLMOptions,
  ): Promise<void> {
    const content = await this.generate(prompt);
    // Simulate streaming by emitting word-by-word
    const words = content.split(" ");
    for (const word of words) {
      await new Promise((r) => setTimeout(r, 5));
      onChunk(word + " ");
    }
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
