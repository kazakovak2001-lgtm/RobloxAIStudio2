/**
 * Groq Provider Tests — mocks HTTP responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GroqProvider } from "../groq";

describe("GroqProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates text from mock response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: "Generated Lua code" }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      }),
    } as Response);

    const provider = new GroqProvider({ apiKey: "test-key" });
    const result = await provider.generate("Write a script");
    expect(result).toBe("Generated Lua code");
  });

  it("tracks token usage", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 50, completion_tokens: 100 },
      }),
    } as Response);

    const provider = new GroqProvider({ apiKey: "test-key" });
    const result = await provider.generateWithMeta("prompt");
    expect(result.tokensUsed).toBe(150);
  });

  it("throws LLMError on HTTP failure", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401 } as Response);
    const provider = new GroqProvider({ apiKey: "bad-key" });
    await expect(provider.generate("test")).rejects.toThrow();
  });
});
