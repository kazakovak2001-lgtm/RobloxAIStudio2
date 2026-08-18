/**
 * B2. Ollama request-timeout infrastructure.
 *
 * Root cause this pins: with `stream: false`, Ollama sends no response headers
 * until the entire generation completes, so Node's fetch (undici) applied its
 * own ~300s headersTimeout and killed long completions as `fetch failed`,
 * regardless of the AbortController deadline the provider had configured. That
 * made the canonical repair chain unreachable for local models, because a
 * repair attempt is a second long call.
 *
 * These tests cover the two halves of the fix: the timeout is configurable and
 * actually reaches the provider, and the request is streamed so no header wait
 * can be interrupted by a ceiling the provider does not control.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../ollama";
import { LLMProviderFactory } from "../providerFactory";

const OLLAMA_ENV = [
  "OLLAMA_TIMEOUT_MS",
  "OLLAMA_LOCAL",
  "OLLAMA_URL",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "DEFAULT_PROVIDER",
  "DEFAULT_MODEL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of OLLAMA_ENV) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of OLLAMA_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

/** The provider's effective deadline. Private by design; read only in tests. */
function configuredTimeout(provider: unknown): number {
  return (provider as { defaultTimeout: number }).defaultTimeout;
}

/** An NDJSON body, as Ollama streams it. */
function ndjsonBody(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + "\n"));
      controller.close();
    },
  });
}

function streamingResponse(lines: string[]): Response {
  return new Response(ndjsonBody(lines), { status: 200 });
}

describe("B2: factory timeout configuration reaches OllamaProvider", () => {
  it("passes OLLAMA_TIMEOUT_MS through to the provider", () => {
    process.env.OLLAMA_LOCAL = "true";
    process.env.OLLAMA_MODEL = "test-model";
    process.env.OLLAMA_TIMEOUT_MS = "900000";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("ollama");
    expect(configuredTimeout(result.provider)).toBe(900000);
  });

  it("passes the timeout through the remote-URL path too", () => {
    process.env.OLLAMA_BASE_URL = "http://example.invalid:11434";
    process.env.OLLAMA_MODEL = "test-model";
    process.env.OLLAMA_TIMEOUT_MS = "450000";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("ollama");
    expect(configuredTimeout(result.provider)).toBe(450000);
  });

  it("passes the timeout through an explicitly forced provider", () => {
    process.env.DEFAULT_PROVIDER = "ollama";
    process.env.OLLAMA_MODEL = "test-model";
    process.env.OLLAMA_TIMEOUT_MS = "300500";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("ollama");
    expect(configuredTimeout(result.provider)).toBe(300500);
  });

  it("keeps the provider default when unset", () => {
    process.env.OLLAMA_LOCAL = "true";
    process.env.OLLAMA_MODEL = "test-model";

    const result = LLMProviderFactory.create();

    expect(configuredTimeout(result.provider)).toBe(120000);
  });

  it.each(["", "0", "-1", "not-a-number"])(
    "falls back to the provider default for unusable value %j",
    (value) => {
      process.env.OLLAMA_LOCAL = "true";
      process.env.OLLAMA_MODEL = "test-model";
      process.env.OLLAMA_TIMEOUT_MS = value;

      const result = LLMProviderFactory.create();

      expect(configuredTimeout(result.provider)).toBe(120000);
    },
  );
});

describe("B2: long generations are not exposed to the headers-timeout ceiling", () => {
  it("requests a streamed completion, so headers arrive with the first token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        streamingResponse([
          JSON.stringify({ response: "ok", done: false }),
          JSON.stringify({ done: true, eval_count: 1 }),
        ]),
      );

    const provider = new OllamaProvider({ model: "test-model" });
    await provider.generate("prompt");

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.stream).toBe(true);
  });

  it("reassembles NDJSON chunks into the full completion with metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamingResponse([
        JSON.stringify({ response: "local ", done: false }),
        JSON.stringify({ response: "part = ", done: false }),
        JSON.stringify({ response: 'Instance.new("Part")', done: false }),
        JSON.stringify({ done: true, eval_count: 42 }),
      ]),
    );

    const provider = new OllamaProvider({ model: "test-model" });
    const result = await provider.generateWithMeta("prompt");

    expect(result.content).toBe('local part = Instance.new("Part")');
    expect(result.tokensUsed).toBe(42);
    expect(result.finishReason).toBe("complete");
  });

  it("survives a chunk split across read boundaries", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"response":"ab'));
        controller.enqueue(encoder.encode('c","done":false}\n'));
        controller.enqueue(encoder.encode('{"done":true,"eval_count":3}\n'));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, { status: 200 }),
    );

    const provider = new OllamaProvider({ model: "test-model" });
    expect(await provider.generate("prompt")).toBe("abc");
  });
});

describe("B2: the configured deadline is still enforced", () => {
  it("times out when the configured limit is genuinely exceeded", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const provider = new OllamaProvider({
      model: "test-model",
      maxRetries: 1,
      timeout: 25,
    });

    await expect(provider.generate("prompt")).rejects.toThrow(
      /timed out after 25ms/,
    );
  });

  it("surfaces a non-ok HTTP status rather than hanging", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("model not found", { status: 404 }),
    );

    const provider = new OllamaProvider({ model: "test-model", maxRetries: 1 });

    await expect(provider.generate("prompt")).rejects.toThrow(/404/);
  });
});

describe("B2: other providers are unchanged", () => {
  it("does not apply OLLAMA_TIMEOUT_MS to a hosted provider", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OLLAMA_TIMEOUT_MS = "900000";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("openai");
    expect(configuredTimeout(result.provider)).not.toBe(900000);
  });

  it("still reports no provider when nothing is configured", () => {
    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("none");
    expect(result.provider).toBeNull();
  });
});
