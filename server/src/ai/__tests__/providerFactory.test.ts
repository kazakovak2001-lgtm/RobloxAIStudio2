/**
 * ProviderFactory Tests — selection, fallback, cost tracking.
 */

import { describe, it, expect, afterEach } from "vitest";
import { LLMProviderFactory, estimateCost } from "../providerFactory";

describe("LLMProviderFactory", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DEFAULT_PROVIDER;
    delete process.env.DEFAULT_MODEL;
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
