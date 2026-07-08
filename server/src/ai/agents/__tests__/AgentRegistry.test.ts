import { describe, it, expect } from "vitest";
import { GovernanceAgentRegistry, AGENT_DEFINITIONS } from "../index";

describe("GovernanceAgentRegistry", () => {
  const registry = new GovernanceAgentRegistry();

  it("registers all 13 agents", () => {
    expect(registry.size).toBe(13);
    expect(registry.listIds()).toContain("requirements");
    expect(registry.listIds()).toContain("orchestrator");
    expect(registry.listIds()).toContain("database");
  });

  it("retrieves agent metadata", () => {
    const meta = registry.get("lua_generator");
    expect(meta).toBeDefined();
    expect(meta!.name).toBe("LuaGenerator");
    expect(meta!.capabilities.canGenerate).toBe(true);
    expect(meta!.requiredContext).toContain("name");
  });

  it("filters by category", () => {
    const generators = registry.getByCategory("generation");
    expect(generators.length).toBeGreaterThan(3);
    expect(generators.every((a) => a.category === "generation")).toBe(true);
  });

  it("filters by capability", () => {
    const validators = registry.getByCapability("canValidate");
    expect(validators.length).toBeGreaterThan(0);
    expect(validators.every((a) => a.capabilities.canValidate)).toBe(true);
  });

  it("validates context - passes when complete", () => {
    const result = registry.validateContext("requirements", {
      name: "Test",
      genre: "rpg",
    });
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("validates context - fails when incomplete", () => {
    const result = registry.validateContext("requirements", { name: "Test" });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("genre");
  });

  it("returns invalid for unknown agent", () => {
    const result = registry.validateContext("nonexistent", {});
    expect(result.valid).toBe(false);
  });

  it("all agents have prompt IDs matching PromptEngine", () => {
    for (const def of AGENT_DEFINITIONS) {
      expect(def.promptId).toMatch(/^prompt-/);
      expect(def.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
