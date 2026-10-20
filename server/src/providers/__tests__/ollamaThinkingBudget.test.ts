/**
 * ACCEPTANCE-OLLAMA-STRUCTURED-OUTPUT-1.
 *
 * Reproduces the Beacon Trial acceptance failure: HTTP 200, nonzero
 * eval_count, but `responseChars=0` and every canonical agent falling back
 * or failing closed with "Lua LLM response is not a valid JSON object".
 *
 * Root cause: reasoning-capable models (qwen3.x) stream chain-of-thought in
 * a separate NDJSON `thinking` field, left disabled/enabled at the model's
 * own default when the request sends no `think` field. That reasoning can
 * consume the whole `num_predict` budget before any `response` token is
 * emitted, especially under a `format` (JSON-schema) constraint. The
 * provider only ever accumulated `chunk.response`, so `content` stayed "".
 *
 * Fix: request `think: false` whenever structured output (`format`) is
 * requested, and propagate Ollama's real `done_reason` into `finishReason`
 * instead of hardcoding "complete".
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../ollama";
import { LuaGeneratorAgent } from "../../agents/implementations/LuaGeneratorAgent";

afterEach(() => vi.restoreAllMocks());

function streamed(lines: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const l of lines) controller.enqueue(encoder.encode(l + "\n"));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function lastBody(mock: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const calls = (mock as unknown as { mock: { calls: unknown[][] } }).mock
    .calls;
  return JSON.parse(
    String((calls[calls.length - 1]?.[1] as RequestInit)?.body),
  );
}

describe("think:false is sent only for structured-output requests", () => {
  it("sends think:false when a responseSchema is requested", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        streamed([
          JSON.stringify({ response: "{}", done: false }),
          JSON.stringify({ done: true, done_reason: "stop", eval_count: 1 }),
        ]),
      );

    await new OllamaProvider({ model: "m" }).generate("p", {
      responseSchema: { type: "object" },
    });

    expect(lastBody(fetchMock).think).toBe(false);
  });

  it('sends think:false when responseFormat: "json" is requested', async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        streamed([
          JSON.stringify({ response: "{}", done: false }),
          JSON.stringify({ done: true, done_reason: "stop", eval_count: 1 }),
        ]),
      );

    await new OllamaProvider({ model: "m" }).generate("p", {
      responseFormat: "json",
    });

    expect(lastBody(fetchMock).think).toBe(false);
  });

  it("omits `think` for free-form requests — model default is untouched", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        streamed([
          JSON.stringify({ response: "hello", done: false }),
          JSON.stringify({ done: true, done_reason: "stop", eval_count: 1 }),
        ]),
      );

    await new OllamaProvider({ model: "m" }).generate("p");

    expect(lastBody(fetchMock)).not.toHaveProperty("think");
  });
});

describe("reasoning-model thinking chunks reproduce and are handled", () => {
  it("REGRESSION: thinking-only stream exhausting the budget yields empty content, not a crash", async () => {
    // The exact acceptance failure shape: the model spends every token on
    // `thinking`, never emits a `response` token, and Ollama reports the
    // run as truncated by length with a nonzero eval_count.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamed([
        JSON.stringify({
          response: "",
          thinking: "Let me plan this out...",
          done: false,
        }),
        JSON.stringify({
          response: "",
          thinking: "Still reasoning about the schema...",
          done: false,
        }),
        JSON.stringify({ done: true, done_reason: "length", eval_count: 2000 }),
      ]),
    );

    const result = await new OllamaProvider({ model: "m" }).generateWithMeta(
      "p",
      { responseSchema: { type: "object" } },
    );

    expect(result.content).toBe("");
    expect(result.tokensUsed).toBe(2000);
    // This is the honesty fix: truncation must be visible, not reported as "complete".
    expect(result.finishReason).toBe("length");
  });

  it("thinking fragments never leak into accumulated content when response text is also present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamed([
        JSON.stringify({
          response: "",
          thinking: "reasoning trace",
          done: false,
        }),
        JSON.stringify({ response: '{"ok":true}', thinking: "", done: false }),
        JSON.stringify({ done: true, done_reason: "stop", eval_count: 50 }),
      ]),
    );

    const result = await new OllamaProvider({ model: "m" }).generateWithMeta(
      "p",
    );

    expect(result.content).toBe('{"ok":true}');
    expect(result.finishReason).toBe("complete");
  });
});

describe("streamed response fragments assemble correctly", () => {
  it("reassembles a payload split across many NDJSON chunks", async () => {
    const payload = JSON.stringify({ scripts: { server: "local x = 1" } });
    const mid = Math.floor(payload.length / 2);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamed([
        JSON.stringify({ response: payload.slice(0, mid), done: false }),
        JSON.stringify({ response: payload.slice(mid), done: false }),
        JSON.stringify({ done: true, done_reason: "stop", eval_count: 12 }),
      ]),
    );

    const result = await new OllamaProvider({ model: "m" }).generateWithMeta(
      "p",
    );

    expect(result.content).toBe(payload);
    expect(JSON.parse(result.content)).toEqual({
      scripts: { server: "local x = 1" },
    });
  });
});

describe("finishReason reflects Ollama's real done_reason", () => {
  it('maps done_reason "length" to finishReason "length"', async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamed([
        JSON.stringify({ response: "partial", done: false }),
        JSON.stringify({ done: true, done_reason: "length", eval_count: 10 }),
      ]),
    );

    const result = await new OllamaProvider({ model: "m" }).generateWithMeta(
      "p",
    );

    expect(result.finishReason).toBe("length");
  });

  it('maps done_reason "stop" to finishReason "complete"', async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamed([
        JSON.stringify({ response: "done", done: false }),
        JSON.stringify({ done: true, done_reason: "stop", eval_count: 10 }),
      ]),
    );

    const result = await new OllamaProvider({ model: "m" }).generateWithMeta(
      "p",
    );

    expect(result.finishReason).toBe("complete");
  });
});

describe("LuaGeneratorAgent end-to-end with the fix", () => {
  const LUA_SERVER =
    'local Players = game:GetService("Players")\nprint("server")';
  const LUA_CLIENT =
    'local Players = game:GetService("Players")\nprint("client")';

  it("valid structured JSON (think:false honored) reaches the agent and parses", async () => {
    const CONFORMING = JSON.stringify({
      lua_generator: {
        server: [{ name: "World.server.lua", code: LUA_SERVER }],
        client: [{ name: "Hud.client.lua", code: LUA_CLIENT }],
        shared: [],
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        streamed([
          JSON.stringify({ response: CONFORMING, done: false }),
          JSON.stringify({ done: true, done_reason: "stop", eval_count: 500 }),
        ]),
      );

    const provider = new OllamaProvider({ model: "m" });
    const agent = new LuaGeneratorAgent();
    agent.setLLM(provider);

    await agent.execute({
      blueprint: { name: "Probe", description: "A contract probe" },
      architecture: { services: ["WorldService"] },
    } as never);

    // The request that carried the schema must have asked the model to skip
    // reasoning, which is the actual fix under test.
    expect(lastBody(fetchMock).think).toBe(false);
  });

  it("still fails closed when generation is exhausted by thinking (genuinely empty response)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamed([
        JSON.stringify({ response: "", thinking: "reasoning...", done: false }),
        JSON.stringify({ done: true, done_reason: "length", eval_count: 6000 }),
      ]),
    );

    const agent = new LuaGeneratorAgent();
    agent.setLLM(new OllamaProvider({ model: "m", maxRetries: 1 }));

    const result = await agent.execute({
      blueprint: { name: "Probe", description: "A contract probe" },
    } as never);

    expect(result.success).toBe(false);
  });

  it("still rejects malformed JSON rather than salvaging it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamed([
        JSON.stringify({
          response:
            '{"lua_generator": {"server": [{"code": "local a = 1\nlocal b = 2"}]}}',
          done: false,
        }),
        JSON.stringify({ done: true, done_reason: "stop", eval_count: 10 }),
      ]),
    );

    const agent = new LuaGeneratorAgent();
    agent.setLLM(new OllamaProvider({ model: "m", maxRetries: 1 }));

    const result = await agent.execute({
      blueprint: { name: "Probe", description: "A contract probe" },
    } as never);

    expect(result.success).toBe(false);
  });
});
