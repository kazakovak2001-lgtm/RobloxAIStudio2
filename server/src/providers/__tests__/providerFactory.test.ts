/**
 * ProviderFactory Tests — selection, fallback, cost tracking.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  LLMProviderFactory,
  estimateCost,
  describeAiMode,
} from "../providerFactory";

describe("LLMProviderFactory", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DEFAULT_PROVIDER;
    delete process.env.DEFAULT_MODEL;
    delete process.env.OLLAMA_URL;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
  });

  it("returns stub mode when no keys configured", () => {
    const result = LLMProviderFactory.create();
    expect(result.mode).toBe("none");
    expect(result.provider).toBeNull();
  });

  it("creates OpenAI provider when key present", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const result = LLMProviderFactory.create();
    expect(result.mode).toBe("openai");
    expect(result.provider).not.toBeNull();
    expect(result.provider!.name).toBe("openai");
  });

  it("creates Groq provider when key present", () => {
    process.env.GROQ_API_KEY = "gsk_test";
    const result = LLMProviderFactory.create();
    expect(result.mode).toBe("groq");
    expect(result.provider!.name).toBe("groq");
  });

  it("OpenAI has higher priority than Anthropic", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.ANTHROPIC_API_KEY = "ant-test";
    const result = LLMProviderFactory.create();
    expect(result.mode).toBe("openai");
  });

  it("Anthropic selected when no OpenAI key", () => {
    process.env.ANTHROPIC_API_KEY = "ant-test";
    const result = LLMProviderFactory.create();
    expect(result.mode).toBe("anthropic");
  });

  it("DEFAULT_MODEL overrides model selection", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.DEFAULT_MODEL = "gpt-4";
    const result = LLMProviderFactory.create();
    expect(result.model).toBe("gpt-4");
  });

  it("DEFAULT_PROVIDER forces specific provider with key", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GROQ_API_KEY = "groq-test";
    process.env.DEFAULT_PROVIDER = "groq";
    const result = LLMProviderFactory.create();
    expect(result.mode).toBe("groq");
  });

  it("falls back to none if DEFAULT_PROVIDER key missing", () => {
    process.env.DEFAULT_PROVIDER = "openai";
    // No OPENAI_API_KEY set
    const result = LLMProviderFactory.create();
    expect(result.mode).toBe("none");
  });
});

/**
 * PROVIDER-1A — an explicitly requested provider must either resolve or fail
 * visibly. It must never silently degrade to stub mode, because stub mode
 * emits deterministic canned content that would otherwise be indistinguishable
 * from a real AI generation.
 */
describe("LLMProviderFactory — explicit provider selection", () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DEFAULT_PROVIDER;
    delete process.env.DEFAULT_MODEL;
    delete process.env.OLLAMA_URL;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
  });

  it("resolves Ollama from DEFAULT_PROVIDER with an explicit URL", () => {
    process.env.DEFAULT_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://localhost:11434";
    process.env.OLLAMA_MODEL = "qwen2.5-coder:7b";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("ollama");
    expect(result.provider).not.toBeNull();
    expect(result.provider!.name).toBe("ollama");
    expect(result.model).toBe("qwen2.5-coder:7b");
    expect(result.unsatisfied).toBeUndefined();
  });

  it("resolves Ollama without a URL by using the localhost default", () => {
    process.env.DEFAULT_PROVIDER = "ollama";
    process.env.OLLAMA_MODEL = "qwen2.5-coder:7b";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("ollama");
    expect(result.provider).not.toBeNull();
    expect(result.unsatisfied).toBeUndefined();
  });

  it("accepts OLLAMA_BASE_URL as the endpoint alias", () => {
    process.env.DEFAULT_PROVIDER = "ollama";
    process.env.OLLAMA_BASE_URL = "http://ollama.internal:11434";
    process.env.OLLAMA_MODEL = "qwen2.5-coder:7b";

    expect(LLMProviderFactory.create().mode).toBe("ollama");
  });

  it("lets DEFAULT_MODEL supply the Ollama model", () => {
    process.env.DEFAULT_PROVIDER = "ollama";
    process.env.DEFAULT_MODEL = "llama3.1:8b";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("ollama");
    expect(result.model).toBe("llama3.1:8b");
  });

  it("reports Ollama as unsatisfied when no model is configured", () => {
    process.env.DEFAULT_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://localhost:11434";

    const result = LLMProviderFactory.create();

    expect(result.provider).toBeNull();
    expect(result.unsatisfied).toBe(true);
    expect(result.requested).toBe("ollama");
  });

  it("resolves OpenRouter from DEFAULT_PROVIDER when a key is present", () => {
    process.env.DEFAULT_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "or-test";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("openrouter");
    expect(result.provider!.name).toBe("openrouter");
    expect(result.unsatisfied).toBeUndefined();
  });

  it("reports OpenRouter as unsatisfied when its key is missing", () => {
    process.env.DEFAULT_PROVIDER = "openrouter";

    const result = LLMProviderFactory.create();

    expect(result.provider).toBeNull();
    expect(result.unsatisfied).toBe(true);
    expect(result.requested).toBe("openrouter");
  });

  it("marks a key-less explicit provider as unsatisfied, not merely absent", () => {
    process.env.DEFAULT_PROVIDER = "openai";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("none");
    expect(result.unsatisfied).toBe(true);
    expect(result.requested).toBe("openai");
    expect(result.unsatisfiedReason).toBeTruthy();
  });

  it("rejects an unknown DEFAULT_PROVIDER name as unsatisfied", () => {
    process.env.DEFAULT_PROVIDER = "not-a-provider";

    const result = LLMProviderFactory.create();

    expect(result.provider).toBeNull();
    expect(result.unsatisfied).toBe(true);
    expect(result.unsatisfiedReason).toContain("unknown provider name");
  });

  it("leaves an unconfigured process unsatisfied-free — nothing was requested", () => {
    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("none");
    expect(result.unsatisfied).toBeUndefined();
    expect(result.requested).toBeUndefined();
  });
});

describe("describeAiMode", () => {
  it("reports stub for an unconfigured process", () => {
    expect(describeAiMode(LLMProviderFactory.create())).toEqual({
      llm: "stub",
    });
  });

  it("reports the unsatisfied request without leaking configuration", () => {
    process.env.DEFAULT_PROVIDER = "openrouter";
    const summary = describeAiMode(LLMProviderFactory.create());
    delete process.env.DEFAULT_PROVIDER;

    expect(summary).toEqual({
      llm: "stub",
      requested: "openrouter",
      unsatisfied: true,
    });
  });

  it("never carries credentials or endpoints for a resolved provider", () => {
    process.env.DEFAULT_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://secret-host.internal:11434";
    process.env.OLLAMA_MODEL = "qwen2.5-coder:7b";
    const summary = describeAiMode(LLMProviderFactory.create());
    delete process.env.DEFAULT_PROVIDER;
    delete process.env.OLLAMA_URL;
    delete process.env.OLLAMA_MODEL;

    expect(summary).toEqual({
      llm: "ollama",
      model: "qwen2.5-coder:7b",
      requested: "ollama",
    });
    expect(JSON.stringify(summary)).not.toContain("secret-host");
  });
});

describe("Cost Estimation", () => {
  it("estimates gpt-4o-mini cost", () => {
    const cost = estimateCost("gpt-4o-mini", 1000);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });

  it("estimates groq cost (cheaper than gpt-4)", () => {
    const groqCost = estimateCost("llama3-8b-8192", 1000);
    const gpt4Cost = estimateCost("gpt-4", 1000);
    expect(groqCost).toBeLessThan(gpt4Cost);
  });

  it("uses default rate for unknown model", () => {
    const cost = estimateCost("unknown-model-xyz", 1000);
    expect(cost).toBeGreaterThan(0);
  });
});
