/**
 * AI-TRUST-BOUNDARY-1
 *
 * Proves each canonical provider (server/src/providers/providerFactory.ts —
 * the "canonical" runtime-ownership entry) sends `LLMOptions.system` through
 * its own native system-role channel, separate from the untrusted user
 * prompt, rather than silently dropping or folding it into `messages[0]`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnthropicProvider } from "../anthropic";
import { OpenAIProvider } from "../openai";
import { GeminiProvider } from "../gemini";
import { OpenRouterProvider } from "../openrouter";
import { GroqProvider } from "../groq";
import { OllamaProvider } from "../ollama";

const SYSTEM = "You are the fixed, server-authored agent instructions.";
const USER_PROMPT = "Untrusted user/blueprint content goes here.";

function mockFetchOnce(json: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => json,
  } as Response);
  return global.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe("AI-TRUST-BOUNDARY-1: provider system-role separation", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("Anthropic: system goes in the top-level `system` field, not into messages", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "end_turn",
    });
    const provider = new AnthropicProvider({ apiKey: "k" });
    await provider.generate(USER_PROMPT, { system: SYSTEM });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.system).toBe(SYSTEM);
    expect(body.messages).toEqual([{ role: "user", content: USER_PROMPT }]);
  });

  it("OpenAI: system becomes a distinct role:system message ahead of the user message", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const provider = new OpenAIProvider({ apiKey: "k" });
    await provider.generate(USER_PROMPT, { system: SYSTEM });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages).toEqual([
      { role: "system", content: SYSTEM },
      { role: "user", content: USER_PROMPT },
    ]);
  });

  it("OpenAI: omitting system preserves the old single-message shape (no regression)", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const provider = new OpenAIProvider({ apiKey: "k" });
    await provider.generate(USER_PROMPT);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages).toEqual([{ role: "user", content: USER_PROMPT }]);
  });

  it("Gemini: system becomes systemInstruction, separate from contents", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [{ content: { parts: [{ text: "ok" }] } }],
    });
    const provider = new GeminiProvider({ apiKey: "k" });
    await provider.generate(USER_PROMPT, { system: SYSTEM });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: SYSTEM }] });
    expect(body.contents).toEqual([{ parts: [{ text: USER_PROMPT }] }]);
  });

  it("OpenRouter: system becomes a distinct role:system message", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const provider = new OpenRouterProvider({ apiKey: "k" });
    await provider.generate(USER_PROMPT, { system: SYSTEM });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages).toEqual([
      { role: "system", content: SYSTEM },
      { role: "user", content: USER_PROMPT },
    ]);
  });

  it("Groq: system becomes a distinct role:system message", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const provider = new GroqProvider({ apiKey: "k" });
    await provider.generate(USER_PROMPT, { system: SYSTEM });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages).toEqual([
      { role: "system", content: SYSTEM },
      { role: "user", content: USER_PROMPT },
    ]);
  });

  it("Ollama: system becomes the native top-level `system` field", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                `${JSON.stringify({ response: "ok", done: true, eval_count: 1 })}\n`,
              ),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      },
    } as unknown as Response);

    const provider = new OllamaProvider({ baseURL: "http://x" });
    await provider.generate(USER_PROMPT, { system: SYSTEM });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.system).toBe(SYSTEM);
    expect(body.prompt).toBe(USER_PROMPT);
  });
});
