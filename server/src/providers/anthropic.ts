import type { LLMProvider, LLMOptions } from "../ai/provider";

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseURL?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseURL ?? "https://api.anthropic.com/v1";
  }

  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: options?.model ?? "claude-3-5-sonnet-20240620",
        max_tokens: options?.maxTokens ?? 2000,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? "";
  }
}
