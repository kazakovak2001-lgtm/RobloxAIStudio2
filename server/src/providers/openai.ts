import type { LLMProvider, LLMOptions } from "../ai/provider";

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseURL?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseURL ?? "https://api.openai.com/v1";
  }

  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? "";
  }
}
