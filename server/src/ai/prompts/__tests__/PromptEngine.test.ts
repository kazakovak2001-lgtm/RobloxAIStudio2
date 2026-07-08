import { describe, it, expect, beforeEach } from "vitest";
import { PromptEngine, type ManagedPrompt } from "../PromptEngine";
import { DEFAULT_PROMPTS } from "../defaultPrompts";
import { createDefaultPromptEngine } from "../index";

const samplePrompt: ManagedPrompt = {
  metadata: {
    id: "test-v1",
    agentType: "test_agent",
    version: "1.0.0",
    description: "Test prompt",
    category: "generation",
    tags: ["test"],
    requiredVariables: ["name", "genre"],
    outputSchema: ["result"],
    maxTokenEstimate: 500,
  },
  system: "You are a {{name}} specialist.",
  user: "Generate for: {{name}} in genre {{genre}}.",
};

describe("PromptEngine", () => {
  let engine: PromptEngine;
  beforeEach(() => {
    engine = new PromptEngine();
  });

  it("registers and renders a prompt", () => {
    engine.register(samplePrompt);
    const result = engine.render("test_agent", {
      name: "SuperGame",
      genre: "rpg",
    });
    expect(result.success).toBe(true);
    expect(result.prompt).toContain("SuperGame");
    expect(result.prompt).toContain("rpg");
    expect(result.system).toContain("SuperGame");
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it("fails render for unregistered agent", () => {
    const result = engine.render("nonexistent", {});
    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      "No prompt registered for agent: nonexistent",
    );
  });

  it("validates missing variables", () => {
    engine.register(samplePrompt);
    const result = engine.render("test_agent", { name: "X" }); // missing genre
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("genre"))).toBe(true);
  });

  it("supports versioning", () => {
    engine.register(samplePrompt);
    const v2: ManagedPrompt = {
      ...samplePrompt,
      metadata: { ...samplePrompt.metadata, version: "2.0.0" },
      user: "V2: {{name}} {{genre}}",
    };
    engine.register(v2);
    const result = engine.render("test_agent", { name: "A", genre: "B" });
    expect(result.prompt).toContain("V2:");
  });

  it("allows setting active version", () => {
    engine.register(samplePrompt);
    const v2: ManagedPrompt = {
      ...samplePrompt,
      metadata: { ...samplePrompt.metadata, version: "2.0.0" },
      user: "V2: {{name}} {{genre}}",
    };
    engine.register(v2);
    engine.setActiveVersion("test_agent", "1.0.0");
    const result = engine.render("test_agent", { name: "A", genre: "B" });
    expect(result.prompt).toContain("Generate for:");
  });

  it("lists agent types", () => {
    engine.register(samplePrompt);
    expect(engine.listAgentTypes()).toContain("test_agent");
    expect(engine.has("test_agent")).toBe(true);
  });

  it("returns metadata", () => {
    engine.register(samplePrompt);
    const meta = engine.getMetadata("test_agent");
    expect(meta?.id).toBe("test-v1");
    expect(meta?.requiredVariables).toContain("name");
  });

  it("warns on deprecated prompts", () => {
    const deprecated: ManagedPrompt = {
      ...samplePrompt,
      metadata: {
        ...samplePrompt.metadata,
        deprecated: true,
        deprecatedBy: "test-v2",
      },
    };
    engine.register(deprecated);
    const validation = engine.validate("test_agent", { name: "X", genre: "Y" });
    expect(validation.warnings.some((w) => w.includes("deprecated"))).toBe(
      true,
    );
  });
});

describe("Default Prompts", () => {
  it("has prompts for all 13 agents", () => {
    expect(DEFAULT_PROMPTS.length).toBe(13);
    const agents = DEFAULT_PROMPTS.map((p) => p.metadata.agentType);
    expect(agents).toContain("requirements");
    expect(agents).toContain("planner");
    expect(agents).toContain("game_designer");
    expect(agents).toContain("roblox_architect");
    expect(agents).toContain("lua_generator");
    expect(agents).toContain("ui_generator");
    expect(agents).toContain("asset_planner");
    expect(agents).toContain("orchestrator");
    expect(agents).toContain("tester");
    expect(agents).toContain("performance");
    expect(agents).toContain("documentation");
    expect(agents).toContain("debug");
    expect(agents).toContain("database");
  });

  it("all prompts have required metadata fields", () => {
    for (const prompt of DEFAULT_PROMPTS) {
      expect(prompt.metadata.id).toBeTruthy();
      expect(prompt.metadata.version).toBeTruthy();
      expect(prompt.metadata.requiredVariables.length).toBeGreaterThan(0);
      expect(prompt.metadata.outputSchema.length).toBeGreaterThan(0);
      expect(prompt.system.length).toBeGreaterThan(10);
      expect(prompt.user.length).toBeGreaterThan(10);
    }
  });

  it("createDefaultPromptEngine loads all prompts", () => {
    const engine = createDefaultPromptEngine();
    expect(engine.size).toBe(13);
    expect(engine.has("requirements")).toBe(true);
    expect(engine.has("orchestrator")).toBe(true);
  });

  it("all prompts render with valid variables", () => {
    const engine = createDefaultPromptEngine();
    for (const prompt of DEFAULT_PROMPTS) {
      const vars: Record<string, string> = {};
      for (const v of prompt.metadata.requiredVariables) vars[v] = `test_${v}`;
      const result = engine.render(prompt.metadata.agentType, vars);
      expect(result.success).toBe(true);
      expect(result.prompt.length).toBeGreaterThan(0);
    }
  });
});
