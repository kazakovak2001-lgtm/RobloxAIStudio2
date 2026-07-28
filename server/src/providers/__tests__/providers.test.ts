/**
 * LLM Provider Unit Tests
 */

import { describe, it, expect } from "vitest";
import { MockProvider } from "../mock";
import { LLMError } from "../../types/llm";
import { withRetry } from "../llmUtils";

describe("MockProvider", () => {
  it("generates deterministic responses", async () => {
    const provider = new MockProvider({ delay: 0 });
    const result = await provider.generate("Hello world");
    expect(result).toContain("mock-generated");
  });

  it("returns pre-programmed responses", async () => {
    const provider = new MockProvider({ delay: 0 });
    provider.setResponse("make a game", "Here is your game blueprint");
    const result = await provider.generate("Please make a game");
    expect(result).toBe("Here is your game blueprint");
  });

  it("generates with metadata", async () => {
    const provider = new MockProvider({ delay: 0 });
    const result = await provider.generateWithMeta("test");
    expect(result.model).toBe("mock");
    expect(result.finishReason).toBe("complete");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("supports streaming", async () => {
    const provider = new MockProvider({ delay: 0 });
    const chunks: string[] = [];
    await provider.stream("test prompt", (chunk) => chunks.push(chunk));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("").trim()).toContain("mock-generated");
  });

  it("passes health check", async () => {
    const provider = new MockProvider();
    expect(await provider.healthCheck()).toBe(true);
  });

  it("has correct provider name", () => {
    const provider = new MockProvider();
    expect(provider.name).toBe("mock");
  });
});

describe("LLMError", () => {
  it("creates error with provider info", () => {
    const error = new LLMError("Rate limited", "openai", 429, true);
    expect(error.message).toBe("Rate limited");
    expect(error.provider).toBe("openai");
    expect(error.statusCode).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.name).toBe("LLMError");
  });

  it("defaults retryable to false", () => {
    const error = new LLMError("Bad request", "anthropic", 400);
    expect(error.retryable).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns on first success", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return "ok";
      },
      3,
      "test",
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on transient errors", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new LLMError("timeout", "test", undefined, true);
        return "recovered";
      },
      3,
      "test",
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("throws after max retries", async () => {
    await expect(
      withRetry(
        async () => {
          throw new LLMError("always fails", "test", 500, true);
        },
        2,
        "test",
      ),
    ).rejects.toThrow("always fails");
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new LLMError("bad request", "test", 400, false);
        },
        3,
        "test",
      ),
    ).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });
});
