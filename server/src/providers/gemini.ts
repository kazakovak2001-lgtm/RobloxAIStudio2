import type { LLMProvider, LLMOptions } from "../ai/provider";

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseURL?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta";
  }

  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/models/${options?.model ?? "gemini-1.5-pro"}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxTokens ?? 2000,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}
