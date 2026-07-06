/**
 * Lua Code Generation Integration Tests (v2.5)
 */

import { describe, it, expect } from "vitest";
import { LuaGenerationEngine } from "../LuaGenerationEngine";
import { LuaFormatter } from "../LuaFormatter";
import { LuaRequireResolver } from "../LuaRequireResolver";
import { LuaCodeValidator } from "../validators/LuaCodeValidator";
import { LuaNamingValidator } from "../validators/LuaNamingValidator";
import { ModuleScriptBuilder } from "../builders/ModuleScriptBuilder";
import { ServerScriptBuilder } from "../builders/ServerScriptBuilder";
import { ConfigurationScriptBuilder } from "../builders/ConfigurationScriptBuilder";
import {
  createEmptyModel,
  type GenerationModel,
} from "../../generation/engine/GenerationModel";

function createTestModel(): GenerationModel {
  const model = createEmptyModel({
    title: "TestGame",
    genre: "obby",
    description: "test",
    targetAudience: "all",
    mechanics: ["jump"],
    maxPlayers: 10,
  });
  model.scripts = [
    {
      id: "s1",
      name: "MainLoop",
      path: "ServerScriptService/MainLoop.lua",
      scriptType: "server",
      content:
        'local Players = game:GetService("Players")\n\nlocal function onPlayer(player)\n    print(player.Name)\nend\n\nPlayers.PlayerAdded:Connect(onPlayer)\n',
      dependencies: [],
      generatedBy: "test",
    },
    {
      id: "s2",
      name: "ClientUI",
      path: "StarterPlayerScripts/ClientUI.lua",
      scriptType: "client",
      content:
        'local player = game:GetService("Players").LocalPlayer\nprint(player.Name)\n',
      dependencies: [],
      generatedBy: "test",
    },
  ];
  model.modules = [
    {
      id: "m1",
      name: "Utils",
      path: "ReplicatedStorage/Modules/Utils.lua",
      exports: ["format", "clamp"],
      dependencies: [],
      generatedBy: "test",
    },
    {
      id: "m2",
      name: "EventBus",
      path: "ReplicatedStorage/Modules/EventBus.lua",
      exports: ["on", "emit"],
      dependencies: [],
      generatedBy: "test",
    },
  ];
  model.configuration = {
    gameSettings: { title: "TestGame", maxPlayers: 10 },
    serverSettings: { tickRate: 30 },
    clientSettings: { uiScale: 1.0 },
  };
  return model;
}

describe("LuaGenerationEngine", () => {
  it("generates all Lua files from model", () => {
    const engine = new LuaGenerationEngine();
    const result = engine.generate(createTestModel());

    expect(result.success).toBe(true);
    expect(result.totalFiles).toBeGreaterThan(4);
    expect(result.totalLines).toBeGreaterThan(20);
    expect(result.validation.valid).toBe(true);
    expect(result.metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles empty model gracefully", () => {
    const engine = new LuaGenerationEngine();
    const model = createEmptyModel({
      title: "Empty",
      genre: "test",
      description: "",
      targetAudience: "all",
      mechanics: [],
      maxPlayers: 1,
    });
    const result = engine.generate(model);
    // Only config files generated for empty model
    expect(result.files.length).toBeGreaterThanOrEqual(3); // 3 config files
    expect(result.success).toBe(true);
  });

  it("produces deterministic output for same input", () => {
    const engine = new LuaGenerationEngine();
    const model = createTestModel();
    const r1 = engine.generate(model);
    const r2 = engine.generate(model);
    expect(r1.files.map((f) => f.content)).toEqual(
      r2.files.map((f) => f.content),
    );
  });
});

describe("LuaFormatter", () => {
  const formatter = new LuaFormatter();

  it("formats indentation correctly", () => {
    const input = "function foo()\nprint('hi')\nend";
    const result = formatter.format(input);
    expect(result).toContain("    print");
    expect(result.endsWith("\n")).toBe(true);
  });

  it("handles nested blocks", () => {
    const input = "function a()\nif true then\nprint(1)\nend\nend";
    const result = formatter.format(input);
    const lines = result.split("\n");
    expect(lines[2]).toMatch(/^\s{8}print/); // double indent
  });

  it("preserves empty lines", () => {
    const result = formatter.format("local x = 1\n\nlocal y = 2");
    expect(result).toContain("\n\n");
  });
});

describe("LuaRequireResolver", () => {
  const resolver = new LuaRequireResolver();

  it("resolves dependency order", () => {
    const modules = [
      {
        id: "m1",
        name: "A",
        path: "a.lua",
        exports: [],
        dependencies: [],
        generatedBy: "t",
      },
      {
        id: "m2",
        name: "B",
        path: "b.lua",
        exports: [],
        dependencies: ["m1"],
        generatedBy: "t",
      },
    ];
    const result = resolver.resolve(modules, []);
    expect(result.valid).toBe(true);
    expect(result.order.indexOf("m1")).toBeLessThan(result.order.indexOf("m2"));
  });

  it("detects cycles", () => {
    const modules = [
      {
        id: "m1",
        name: "A",
        path: "a.lua",
        exports: [],
        dependencies: ["m2"],
        generatedBy: "t",
      },
      {
        id: "m2",
        name: "B",
        path: "b.lua",
        exports: [],
        dependencies: ["m1"],
        generatedBy: "t",
      },
    ];
    const result = resolver.resolve(modules, []);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });
});

describe("Validators", () => {
  it("LuaCodeValidator passes valid code", () => {
    const validator = new LuaCodeValidator();
    const result = validator.validate([
      {
        path: "test.lua",
        content: "local x = 1\nprint(x)\n",
        lines: 2,
        size: 30,
      },
    ]);
    expect(result.valid).toBe(true);
  });

  it("LuaCodeValidator detects empty files", () => {
    const validator = new LuaCodeValidator();
    const result = validator.validate([
      { path: "empty.lua", content: "", lines: 0, size: 0 },
    ]);
    expect(result.valid).toBe(false);
  });

  it("LuaNamingValidator detects duplicates", () => {
    const validator = new LuaNamingValidator();
    const result = validator.validate([
      { path: "a/Main.lua", content: "x", lines: 1, size: 2 },
      { path: "b/Main.lua", content: "y", lines: 1, size: 2 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.duplicates.length).toBeGreaterThan(0);
  });
});

describe("Builders", () => {
  it("ServerScriptBuilder produces formatted output", () => {
    const builder = new ServerScriptBuilder();
    const result = builder.build([
      {
        id: "s1",
        name: "Test",
        path: "Server/Test.lua",
        scriptType: "server",
        content: "function main()\nprint('hi')\nend\nmain()\n",
        dependencies: [],
        generatedBy: "t",
      },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].content).toContain("    print"); // formatted
  });

  it("ModuleScriptBuilder generates module structure", () => {
    const builder = new ModuleScriptBuilder();
    const result = builder.build([
      {
        id: "m1",
        name: "Utils",
        path: "Shared/Utils.lua",
        exports: ["foo", "bar"],
        dependencies: [],
        generatedBy: "t",
      },
    ]);
    expect(result[0].content).toContain("function Utils.foo()");
    expect(result[0].content).toContain("return Utils");
  });

  it("ConfigurationScriptBuilder generates config", () => {
    const builder = new ConfigurationScriptBuilder();
    const result = builder.build(
      { gameSettings: { title: "X" }, serverSettings: {}, clientSettings: {} },
      "MyGame",
    );
    expect(result.length).toBe(3);
    expect(result[0].content).toContain("title");
  });
});
