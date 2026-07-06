/**
 * Concrete Generators Integration Tests (v2.3)
 */

import { describe, it, expect } from "vitest";
import { GenerationEngine } from "../GenerationEngine";
import { GeneratorRegistry } from "../GeneratorRegistry";
import { ScriptGenerator } from "../generators/ScriptGenerator";
import { ModuleGenerator } from "../generators/ModuleGenerator";
import { ServiceGenerator } from "../generators/ServiceGenerator";
import { FolderGenerator } from "../generators/FolderGenerator";
import { ConfigurationGenerator } from "../generators/ConfigurationGenerator";
import { LuaScriptBuilder } from "../builders/LuaScriptBuilder";
import { ModuleBuilder } from "../builders/ModuleBuilder";
import { ConfigurationBuilder } from "../builders/ConfigurationBuilder";
import { FolderBuilder } from "../builders/FolderBuilder";
import { ManifestBuilder } from "../builders/ManifestBuilder";
import { LuaSyntaxValidator } from "../validators/LuaSyntaxValidator";
import { GeneratorExecutionGraph } from "../GeneratorExecutionGraph";
import { createEmptyModel } from "../GenerationModel";
import { createEmptyProjectModel } from "../model/RobloxProjectModel";

function createFullRegistry(): GeneratorRegistry {
  const registry = new GeneratorRegistry();
  registry.register(new FolderGenerator());
  registry.register(new ServiceGenerator());
  registry.register(new ScriptGenerator());
  registry.register(new ModuleGenerator());
  registry.register(new ConfigurationGenerator());
  return registry;
}

describe("Full Generation Pipeline (v2.3)", () => {
  it("generates a complete model with all generators", async () => {
    const registry = createFullRegistry();
    const engine = new GenerationEngine(registry);

    const result = await engine.generate({
      name: "Super Obby",
      genre: "obby",
      game_type: "obby",
      mechanics: ["jumping", "climbing", "sliding"],
      target_audience: "kids",
      estimated_players: 20,
    });

    expect(result.success).toBe(true);
    expect(result.model.folders.length).toBeGreaterThan(5);
    expect(result.model.services.length).toBeGreaterThan(3);
    expect(result.model.scripts.length).toBeGreaterThan(3);
    expect(result.model.modules.length).toBe(3);
    expect(result.model.game.title).toBe("Super Obby");
    expect(result.model.configuration.gameSettings).toHaveProperty("title");
  });

  it("generates scripts with valid Lua syntax", async () => {
    const registry = createFullRegistry();
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Lua Test",
      genre: "adventure",
      mechanics: ["combat"],
    });

    const validator = new LuaSyntaxValidator();
    const scripts = result.model.scripts.map((s) => ({
      path: s.path,
      content: s.content,
      name: s.name,
    }));
    const luaResult = validator.validateAll(scripts);

    expect(luaResult.valid).toBe(true);
    expect(luaResult.errors).toHaveLength(0);
    expect(luaResult.scriptsChecked).toBeGreaterThan(0);
  });
});

describe("LuaSyntaxValidator", () => {
  const validator = new LuaSyntaxValidator();

  it("passes valid Lua", () => {
    const result = validator.validate("test.lua", `local x = 1\nprint(x)`);
    expect(result.valid).toBe(true);
  });

  it("detects empty scripts", () => {
    const result = validator.validateAll([
      { path: "empty.lua", content: "", name: "empty" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("Empty");
  });

  it("detects duplicate names", () => {
    const result = validator.validateAll([
      { path: "a.lua", content: "local x = 1", name: "Main" },
      { path: "b.lua", content: "local y = 2", name: "Main" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(
      true,
    );
  });

  it("detects unbalanced blocks", () => {
    const result = validator.validate(
      "bad.lua",
      "function foo()\nprint('hi')\n",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unbalanced");
  });
});

describe("Builders", () => {
  it("LuaScriptBuilder produces nodes", () => {
    const builder = new LuaScriptBuilder();
    const script = {
      id: "s1",
      name: "Test",
      path: "Server/Test.lua",
      scriptType: "server" as const,
      content: "print(1)",
      dependencies: [],
      generatedBy: "test",
    };
    const built = builder.build(script);
    expect(built.node.type).toBe("Script");
    expect(built.content).toBe("print(1)");
  });

  it("ModuleBuilder generates content", () => {
    const builder = new ModuleBuilder();
    const mod = {
      id: "m1",
      name: "Utils",
      path: "Shared/Utils.lua",
      exports: ["foo", "bar"],
      dependencies: [],
      generatedBy: "test",
    };
    const built = builder.build(mod);
    expect(built.content).toContain("function Utils.foo()");
    expect(built.content).toContain("function Utils.bar()");
    expect(built.node.type).toBe("ModuleScript");
  });

  it("ConfigurationBuilder generates configs", () => {
    const builder = new ConfigurationBuilder();
    const configs = builder.build(
      {
        gameSettings: { title: "Test" },
        serverSettings: { tick: 30 },
        clientSettings: { ui: true },
      },
      "Test",
    );
    expect(configs.length).toBe(3);
    expect(configs[0].content).toContain("Test");
  });

  it("FolderBuilder produces folder nodes", () => {
    const builder = new FolderBuilder();
    const folders = builder.build([
      { path: "ServerScriptService", parent: "game", purpose: "Scripts" },
    ]);
    expect(folders[0].type).toBe("Folder");
    expect(folders[0].name).toBe("ServerScriptService");
  });

  it("ManifestBuilder produces manifest", () => {
    const builder = new ManifestBuilder();
    const model = createEmptyModel({
      title: "Test",
      genre: "rpg",
      description: "",
      targetAudience: "all",
      mechanics: [],
      maxPlayers: 10,
    });
    model.scripts.push({
      id: "s1",
      name: "A",
      path: "x.lua",
      scriptType: "server",
      content: "x",
      dependencies: [],
      generatedBy: "t",
    });
    const manifest = builder.build(model, ["folder-gen", "script-gen"]);
    expect(manifest.counts.scripts).toBe(1);
    expect(manifest.generators).toContain("script-gen");
  });
});

describe("GeneratorExecutionGraph", () => {
  it("builds valid execution order", () => {
    const graph = new GeneratorExecutionGraph();
    const result = graph.build([
      new FolderGenerator(),
      new ServiceGenerator(),
      new ScriptGenerator(),
      new ModuleGenerator(),
    ]);
    expect(result.valid).toBe(true);

    const order = graph.getExecutionOrder();
    expect(order.indexOf("folder-generator")).toBeLessThan(
      order.indexOf("service-generator"),
    );
    expect(order.indexOf("service-generator")).toBeLessThan(
      order.indexOf("script-generator"),
    );
    expect(order.indexOf("script-generator")).toBeLessThan(
      order.indexOf("module-generator"),
    );
  });

  it("tracks execution status", () => {
    const graph = new GeneratorExecutionGraph();
    graph.build([new FolderGenerator()]);
    graph.markRunning("folder-generator");
    graph.markCompleted("folder-generator", 5);
    const nodes = graph.getNodes();
    expect(nodes[0].status).toBe("completed");
    expect(nodes[0].durationMs).toBe(5);
  });
});

describe("RobloxProjectModel", () => {
  it("creates standard hierarchy", () => {
    const project = createEmptyProjectModel("My Game");
    expect(project.name).toBe("My Game");
    expect(project.dataModel.serverScriptService.name).toBe(
      "ServerScriptService",
    );
    expect(project.dataModel.replicatedStorage.name).toBe("ReplicatedStorage");
    expect(project.dataModel.starterPlayer.starterPlayerScripts.name).toBe(
      "StarterPlayerScripts",
    );
    expect(project.dataModel.workspace.name).toBe("Workspace");
  });
});

describe("Invalid scenarios", () => {
  it("handles invalid model gracefully", async () => {
    const registry = new GeneratorRegistry();
    registry.register(new FolderGenerator());
    const engine = new GenerationEngine(registry);
    // Empty blueprint → model with defaults
    const result = await engine.generate({});
    expect(result.model.game.title).toBe("Untitled Game");
  });

  it("handles missing dependency gracefully", async () => {
    // ModuleGenerator depends on script-generator which isn't registered
    const registry = new GeneratorRegistry();
    registry.register(new ModuleGenerator());
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({ name: "Dep Test", genre: "test" });
    // Should still complete (dependency resolution handles missing deps)
    expect(result.model).toBeDefined();
  });
});
