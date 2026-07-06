/**
 * Generation Engine Integration Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GenerationEngine } from "../GenerationEngine";
import { GenerationEngineFactory } from "../GenerationEngineFactory";
import { GeneratorRegistry } from "../GeneratorRegistry";
import {
  BaseGenerator,
  type GeneratorInput,
  type GeneratorOutput,
  type GeneratorMetadata,
} from "../BaseGenerator";
import { GenerationDependencyResolver } from "../GenerationDependencyResolver";
import { GenerationModelValidator } from "../GenerationModelValidator";
import { GenerationCache } from "../GenerationCache";
import { createEmptyModel } from "../GenerationModel";

// ─── Mock Generators ─────────────────────────────────────────────────────────

class MockScriptGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "script-gen",
    name: "Script Generator",
    version: "1.0.0",
    dependencies: [],
    produces: ["scripts"],
  };

  async generate(input: GeneratorInput): Promise<GeneratorOutput> {
    input.model.scripts.push({
      id: "s1",
      name: "MainScript",
      path: "ServerScriptService/Main.lua",
      scriptType: "server",
      content: "print('Hello')",
      dependencies: [],
      generatedBy: "script-gen",
    });
    return {
      generatorId: "script-gen",
      success: true,
      modifications: ["scripts"],
      durationMs: 5,
    };
  }
}

class MockUIGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "ui-gen",
    name: "UI Generator",
    version: "1.0.0",
    dependencies: ["script-gen"],
    produces: ["ui"],
  };

  async generate(input: GeneratorInput): Promise<GeneratorOutput> {
    input.model.ui.push({
      id: "u1",
      name: "MainMenu",
      screenType: "menu",
      elements: [{ type: "Frame", name: "Container", properties: {} }],
      generatedBy: "ui-gen",
    });
    return {
      generatorId: "ui-gen",
      success: true,
      modifications: ["ui"],
      durationMs: 3,
    };
  }
}

class MockFailingGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "failing-gen",
    name: "Failing Generator",
    version: "1.0.0",
    dependencies: [],
    produces: [],
  };

  async generate(_input: GeneratorInput): Promise<GeneratorOutput> {
    return {
      generatorId: "failing-gen",
      success: false,
      modifications: [],
      durationMs: 1,
      error: "Intentional failure",
    };
  }
}

class MockCircularA extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "circular-a",
    name: "A",
    version: "1.0.0",
    dependencies: ["circular-b"],
    produces: [],
  };
  async generate(_input: GeneratorInput): Promise<GeneratorOutput> {
    return {
      generatorId: "circular-a",
      success: true,
      modifications: [],
      durationMs: 0,
    };
  }
}

class MockCircularB extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "circular-b",
    name: "B",
    version: "1.0.0",
    dependencies: ["circular-a"],
    produces: [],
  };
  async generate(_input: GeneratorInput): Promise<GeneratorOutput> {
    return {
      generatorId: "circular-b",
      success: true,
      modifications: [],
      durationMs: 0,
    };
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GenerationEngine — successful generation", () => {
  it("generates a model with registered generators", async () => {
    const registry = new GeneratorRegistry();
    registry.register(new MockScriptGenerator());
    registry.register(new MockUIGenerator());

    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Test Game",
      genre: "adventure",
      mechanics: ["jump", "collect"],
    });

    expect(result.success).toBe(true);
    expect(result.model.scripts.length).toBe(1);
    expect(result.model.ui.length).toBe(1);
    expect(result.model.game.title).toBe("Test Game");
    expect(result.context.timings.totalMs).toBeGreaterThan(0);
  });

  it("emits events during generation", async () => {
    const registry = new GeneratorRegistry();
    registry.register(new MockScriptGenerator());

    const engine = new GenerationEngine(registry);
    const events: string[] = [];
    engine.on((e) => events.push(e.type));

    await engine.generate({ name: "Event Test", genre: "rpg" });

    expect(events).toContain("GenerationStarted");
    expect(events).toContain("GeneratorStarted");
    expect(events).toContain("GeneratorCompleted");
    expect(events).toContain("GenerationValidated");
  });
});

describe("GenerationEngine — invalid blueprint", () => {
  it("handles empty blueprint gracefully", async () => {
    const engine = GenerationEngineFactory.createDefault();
    const result = await engine.generate({});

    // Should still produce a model (with defaults) but validation may warn
    expect(result.model).toBeDefined();
    expect(result.model.game.title).toBe("Untitled Game");
  });
});

describe("GenerationEngine — circular dependencies", () => {
  it("detects circular generator dependencies", async () => {
    const registry = new GeneratorRegistry();
    registry.register(new MockCircularA());
    registry.register(new MockCircularB());

    const engine = new GenerationEngine(registry);
    const result = await engine.generate({ name: "Cycle Test", genre: "test" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Circular");
  });
});

describe("GenerationEngine — failing generator", () => {
  it("records generator failure without crashing", async () => {
    const registry = new GeneratorRegistry();
    registry.register(new MockFailingGenerator());
    registry.register(new MockScriptGenerator());

    const engine = new GenerationEngine(registry);
    const result = await engine.generate({ name: "Fail Test", genre: "test" });

    // Engine completes but failing generator is recorded
    expect(result.context.generatorResults["failing-gen"].success).toBe(false);
    expect(result.context.generatorResults["script-gen"].success).toBe(true);
  });
});

describe("GeneratorRegistry", () => {
  it("registers and retrieves generators", () => {
    const registry = new GeneratorRegistry();
    registry.register(new MockScriptGenerator());

    expect(registry.has("script-gen")).toBe(true);
    expect(registry.size).toBe(1);
    expect(registry.listIds()).toEqual(["script-gen"]);
  });

  it("throws on duplicate registration", () => {
    const registry = new GeneratorRegistry();
    registry.register(new MockScriptGenerator());
    expect(() => registry.register(new MockScriptGenerator())).toThrow(
      "already registered",
    );
  });
});

describe("GenerationDependencyResolver", () => {
  it("resolves valid dependency order", () => {
    const resolver = new GenerationDependencyResolver();
    const result = resolver.resolve([
      new MockScriptGenerator(),
      new MockUIGenerator(),
    ]);

    expect(result.valid).toBe(true);
    expect(result.order.indexOf("script-gen")).toBeLessThan(
      result.order.indexOf("ui-gen"),
    );
  });

  it("detects circular dependencies", () => {
    const resolver = new GenerationDependencyResolver();
    const result = resolver.resolve([new MockCircularA(), new MockCircularB()]);

    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });
});

describe("GenerationModelValidator", () => {
  it("validates a complete model", () => {
    const validator = new GenerationModelValidator();
    const model = createEmptyModel({
      title: "Test",
      genre: "adventure",
      description: "A game",
      targetAudience: "all",
      mechanics: [],
      maxPlayers: 10,
    });
    model.services = [
      {
        name: "DataStore",
        type: "server",
        description: "test",
        dependencies: [],
      },
    ];

    const result = validator.validate(model);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing title", () => {
    const validator = new GenerationModelValidator();
    const model = createEmptyModel({
      title: "",
      genre: "test",
      description: "",
      targetAudience: "all",
      mechanics: [],
      maxPlayers: 4,
    });

    const result = validator.validate(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("title"))).toBe(true);
  });
});

describe("GenerationCache", () => {
  let cache: GenerationCache;

  beforeEach(() => {
    cache = new GenerationCache(5);
  });

  it("stores and retrieves values", () => {
    cache.set("key1", { data: "hello" });
    expect(cache.get("key1")).toEqual({ data: "hello" });
  });

  it("returns null for missing keys", () => {
    expect(cache.get("missing")).toBeNull();
  });

  it("invalidates entries", () => {
    cache.set("key1", "value");
    cache.invalidate("key1");
    expect(cache.get("key1")).toBeNull();
  });

  it("tracks hit/miss statistics", () => {
    cache.set("a", 1);
    cache.get("a"); // hit
    cache.get("b"); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRatio).toBe(0.5);
  });

  it("evicts LRU when full", () => {
    for (let i = 0; i < 6; i++) cache.set(`k${i}`, i);
    // k0 should be evicted (oldest)
    expect(cache.size).toBe(5);
  });
});
