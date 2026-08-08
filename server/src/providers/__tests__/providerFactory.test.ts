/**
 * ProviderFactory Tests — selection, fallback, cost tracking.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  LLMProviderFactory,
  estimateCost,
  describeAiMode,
  shouldRefuseStartupWithoutProvider,
} from "../providerFactory";

/**
 * Every environment variable provider resolution reads. The PROVIDER-1A suites
 * clear these before and after each test: before, so a credential exported in
 * the developer's or runner's shell cannot change a result; after, so a failed
 * assertion cannot leak state into the next test. Inline cleanup at the end of
 * a test body is skipped when an expectation throws, so it is not sufficient.
 */
const PROVIDER_ENV_KEYS = [
  "DEFAULT_PROVIDER",
  "DEFAULT_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OLLAMA_URL",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "OLLAMA_LOCAL",
] as const;

function clearProviderEnv(): void {
  for (const key of PROVIDER_ENV_KEYS) delete process.env[key];
}

/** Install deterministic provider-environment isolation for a describe block. */
function useIsolatedProviderEnv(): void {
  beforeEach(clearProviderEnv);
  afterEach(clearProviderEnv);
}

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
  useIsolatedProviderEnv();

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

  /**
   * Ollama is a keyless local provider. Forcing it must never be gated on a
   * credential — the original defect reported it as "no API key found".
   */
  it("forces Ollama with no API key of any kind present", () => {
    // useIsolatedProviderEnv() has already removed every provider credential,
    // so nothing below could be satisfying a key requirement.
    process.env.DEFAULT_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://localhost:11434";
    process.env.OLLAMA_MODEL = "qwen2.5-coder:7b";

    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("ollama");
    expect(result.provider).not.toBeNull();
    expect(result.unsatisfied).toBeUndefined();
    // The exact startup line an operator verifies against.
    expect(result.info).toBe(
      "Ollama (forced, url: http://localhost:11434, model: qwen2.5-coder:7b)",
    );
    expect(result.info).not.toContain("API key");
  });

  /**
   * The keyless Ollama path must not have relaxed credential checking for
   * anyone else. Every cloud provider still fails closed without its key.
   */
  it.each([
    ["openai", "OPENAI_API_KEY"],
    ["anthropic", "ANTHROPIC_API_KEY"],
    ["gemini", "GEMINI_API_KEY"],
    ["groq", "GROQ_API_KEY"],
    ["openrouter", "OPENROUTER_API_KEY"],
  ])("still requires a credential for forced %s", (provider, keyName) => {
    process.env.DEFAULT_PROVIDER = provider;

    const withoutKey = LLMProviderFactory.create();

    expect(withoutKey.provider).toBeNull();
    expect(withoutKey.mode).toBe("none");
    expect(withoutKey.unsatisfied).toBe(true);
    expect(withoutKey.requested).toBe(provider);

    process.env[keyName] = "test-credential";
    const withKey = LLMProviderFactory.create();

    expect(withKey.mode).toBe(provider);
    expect(withKey.provider).not.toBeNull();
    expect(withKey.unsatisfied).toBeUndefined();
  });
});

/**
 * The startup refusal must fire whenever no provider resolved. Gating it on
 * `unsatisfied` alone would let a release image that lost its provider
 * configuration entirely start normally and serve deterministic fallbacks —
 * the exact misconfiguration this control exists to catch.
 */
describe("shouldRefuseStartupWithoutProvider", () => {
  useIsolatedProviderEnv();

  it("refuses when nothing at all is configured", () => {
    const result = LLMProviderFactory.create();

    expect(result.mode).toBe("none");
    expect(result.unsatisfied).toBeUndefined();
    expect(shouldRefuseStartupWithoutProvider(result, "true")).toBe(true);
  });

  it("refuses when an explicit provider could not be constructed", () => {
    process.env.DEFAULT_PROVIDER = "openai";

    expect(
      shouldRefuseStartupWithoutProvider(LLMProviderFactory.create(), "true"),
    ).toBe(true);
  });

  it("allows startup when a provider resolved", () => {
    process.env.DEFAULT_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://localhost:11434";
    process.env.OLLAMA_MODEL = "qwen2.5-coder:7b";

    expect(
      shouldRefuseStartupWithoutProvider(LLMProviderFactory.create(), "true"),
    ).toBe(false);
  });

  it('stays off unless the flag is exactly "true"', () => {
    const result = LLMProviderFactory.create();

    expect(shouldRefuseStartupWithoutProvider(result, undefined)).toBe(false);
    expect(shouldRefuseStartupWithoutProvider(result, "false")).toBe(false);
    expect(shouldRefuseStartupWithoutProvider(result, "1")).toBe(false);
  });
});

describe("describeAiMode", () => {
  useIsolatedProviderEnv();

  it("reports stub for an unconfigured process", () => {
    expect(describeAiMode(LLMProviderFactory.create())).toEqual({
      llm: "stub",
    });
  });

  it("reports the unsatisfied request without leaking configuration", () => {
    process.env.DEFAULT_PROVIDER = "openrouter";

    expect(describeAiMode(LLMProviderFactory.create())).toEqual({
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
