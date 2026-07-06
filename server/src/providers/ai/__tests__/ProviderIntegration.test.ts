/**
 * AI Provider Integration Tests (v2.8)
 */

import { describe, it, expect } from "vitest";
import { ProviderFactory } from "../ProviderFactory";
import { ProviderRegistry } from "../ProviderRegistry";
import { OpenAIProvider } from "../adapters/OpenAIProvider";
import { AnthropicProvider } from "../adapters/AnthropicProvider";
import { LocalProvider } from "../adapters/LocalProvider";
import { ResponseNormalizer } from "../ResponseNormalizer";
import { PromptBuilder } from "../PromptBuilder";
import { ProviderHealthService } from "../ProviderHealthService";
import { ProviderFallbackManager } from "../RetryPolicy";

describe("ProviderRegistry", () => {
  it("registers and retrieves providers", () => {
    const registry = new ProviderRegistry();
    registry.register(new OpenAIProvider());
    registry.register(new AnthropicProvider());
    expect(registry.size).toBe(2);
    expect(registry.has("openai")).toBe(true);
    expect(registry.has("anthropic")).toBe(true);
  });

  it("returns providers by priority", () => {
    const registry = ProviderFactory.createDefault();
    const sorted = registry.getByPriority();
    expect(sorted[0].type).toBe("openai"); // priority 1
    expect(sorted[1].type).toBe("anthropic"); // priority 2
  });

  it("finds providers by capability", () => {
    const registry = ProviderFactory.createDefault();
    const found = registry.findByCapability({
      structuredJSON: true,
      codeGeneration: true,
    });
    expect(found).toBeDefined();
    expect(found!.capability.structuredJSON).toBe(true);
  });

  it("excludes disabled providers", () => {
    const registry = new ProviderRegistry();
    const p = new OpenAIProvider();
    p.disable();
    registry.register(p);
    expect(registry.getEnabled().length).toBe(0);
  });
});

describe("ResponseNormalizer", () => {
  const normalizer = new ResponseNormalizer();

  it("normalizes a successful response", () => {
    const result = normalizer.normalize({
      content: '{"x":1}',
      model: "gpt-4o",
      provider: "openai",
      tokensUsed: 10,
      durationMs: 50,
      finishReason: "complete",
    });
    expect(result.success).toBe(true);
    expect(result.json).toEqual({ x: 1 });
  });

  it("extracts JSON from markdown code block", () => {
    const result = normalizer.extractJSON(
      'Here is the result:\n```json\n{"key":"value"}\n```',
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ key: "value" });
  });

  it("handles malformed response", () => {
    const result = normalizer.extractJSON("This is not JSON at all.");
    expect(result.success).toBe(false);
  });

  it("validates schema", () => {
    const result = normalizer.validateSchema({ name: "X", genre: "rpg" }, [
      "name",
      "genre",
      "mechanics",
    ]);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("mechanics");
  });
});

describe("PromptBuilder", () => {
  it("builds prompt from template", () => {
    const builder = new PromptBuilder();
    builder.registerTemplate({
      id: "game-gen",
      system: "You are a game designer.",
      user: "Design a {{genre}} game called {{name}}.",
      variables: ["genre", "name"],
    });
    const result = builder.build("game-gen", {
      variables: { genre: "obby", name: "Super Obby" },
    });
    expect(result.success).toBe(true);
    expect(result.prompt).toContain("obby");
    expect(result.prompt).toContain("Super Obby");
  });

  it("fails on missing variables", () => {
    const builder = new PromptBuilder();
    builder.registerTemplate({
      id: "t1",
      system: "sys",
      user: "{{x}}",
      variables: ["x"],
    });
    const result = builder.build("t1", { variables: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing");
  });

  it("validates prompts", () => {
    const builder = new PromptBuilder();
    expect(builder.validate("").valid).toBe(false);
    expect(builder.validate("Hello {{unresolved}}").valid).toBe(false);
    expect(builder.validate("Hello world").valid).toBe(true);
  });
});

describe("ProviderHealthService", () => {
  it("tracks success and failure", () => {
    const registry = ProviderFactory.createDefault();
    const health = new ProviderHealthService(registry);
    health.recordSuccess("openai", 100);
    health.recordSuccess("openai", 200);
    health.recordFailure("anthropic");
    const openaiHealth = health.getHealth("openai");
    expect(openaiHealth?.requestCount).toBe(2);
    expect(openaiHealth?.failureRate).toBe(0);
    const anthropicHealth = health.getHealth("anthropic");
    expect(anthropicHealth?.failureCount).toBe(1);
  });

  it("disables provider after consecutive failures", () => {
    const registry = new ProviderRegistry();
    registry.register(new LocalProvider());
    const health = new ProviderHealthService(registry);
    for (let i = 0; i < 5; i++) health.recordFailure("local");
    const h = health.getHealth("local");
    expect(h?.status).toBe("unavailable");
    expect(registry.get("local")?.status).toBe("unavailable");
  });
});

describe("ProviderFallbackManager", () => {
  it("executes request with primary provider", async () => {
    const registry = ProviderFactory.createDefault();
    const health = new ProviderHealthService(registry);
    const fallback = new ProviderFallbackManager(registry, health);
    const result = await fallback.execute({
      prompt: "Generate something",
      responseFormat: "text",
    });
    expect(result.success).toBe(true);
    expect(result.provider).toBe("openai"); // highest priority
  });

  it("falls back when primary is unavailable", async () => {
    const registry = new ProviderRegistry();
    const disabled = new OpenAIProvider();
    disabled.setStatus("unavailable");
    registry.register(disabled);
    registry.register(new AnthropicProvider());
    const health = new ProviderHealthService(registry);
    const fallback = new ProviderFallbackManager(registry, health);
    const result = await fallback.execute({ prompt: "Test" });
    expect(result.success).toBe(true);
    expect(result.provider).toBe("anthropic");
  });
});
