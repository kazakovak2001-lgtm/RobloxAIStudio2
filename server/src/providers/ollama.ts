import type { LLMProvider, LLMOptions } from "../ai/provider";

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;

  constructor(config?: { baseURL?: string }) {
    this.baseUrl = config?.baseURL ?? "http://localhost:11434";
  }

  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options?.model ?? "llama3",
        prompt,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2000,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response ?? "";
  }
}
