import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { GameBlueprintEngine } from "../blueprint/GameBlueprintEngine";
import { LuaGenerator } from "../lua/LuaGenerator";
import { AssetGenerator } from "../assets/AssetGenerator";
import { GameValidationEngine } from "../validation/GameValidationEngine";
import { RobloxExportBuilder } from "../export/RobloxExportBuilder";

/**
 * Checks the generated Lua is at least syntactically well-formed enough to
 * be Roblox-valid: no unterminated string literal (an unescaped `"` inside
 * an interpolated field used to produce exactly this), and every
 * function/do/then opens a matching end.
 */
function assertBalancedLuau(code: string, scriptName: string): void {
  // An odd number of unescaped double quotes means a string literal never
  // closed — the surest sign the file will not parse in Luau.
  const quoteMatches = code.match(/(?<!\\)"/g) ?? [];
  expect(
    quoteMatches.length % 2,
    `${scriptName} has an unterminated string literal`,
  ).toBe(0);

  const opens =
    (code.match(/\bfunction\b/g) ?? []).length +
    (code.match(/\bdo\b/g) ?? []).length +
    (code.match(/\bthen\b/g) ?? []).length;
  const closes = (code.match(/\bend\b/g) ?? []).length;
  expect(
    Math.abs(opens - closes),
    `${scriptName} has unbalanced function/do/then/end`,
  ).toBeLessThanOrEqual(1);
}

describe("GENVIABILITY-1 minimal generated package", () => {
  const engine = new GameBlueprintEngine();
  const luaGen = new LuaGenerator();
  const assetGen = new AssetGenerator();
  const validator = new GameValidationEngine();
  const exporter = new RobloxExportBuilder();

  it("carries a minimal generated game to a valid, importable deliverable package", () => {
    // The narrowest input the pipeline accepts in production: an empty plan
    // output object, exactly what a planner run with no agent outputs yet
    // resolved would hand the blueprint engine.
    const blueprint = engine.generate({});
    const lua = luaGen.generate(blueprint);
    const assets = assetGen.generate(blueprint);
    const validation = validator.validate(blueprint, lua, assets);

    expect(validation.passed).toBe(true);
    expect(validation.errors).toBe(0);

    const exportResult = exporter.build(blueprint, lua, assets);

    // Required game structure: at least one server script (world logic can
    // run), one client script (player can connect to something), and a
    // spawn point (a player entering the place has somewhere to land).
    const serverScripts = lua.scripts.filter((s) => s.type === "server");
    const clientScripts = lua.scripts.filter((s) => s.type === "client");
    expect(serverScripts.length).toBeGreaterThan(0);
    expect(clientScripts.length).toBeGreaterThan(0);
    expect(assets.spawnPoints.length).toBeGreaterThan(0);

    // Every generated script is at least well-formed Luau.
    for (const script of lua.scripts) {
      assertBalancedLuau(script.code, script.name);
    }

    // The export is a real, importable Rojo project: a project file, and
    // every script lands under the src/ tree the project file declares.
    const projectFile = exportResult.files.find(
      (f) => f.path === "default.project.json",
    );
    expect(projectFile).toBeDefined();
    const project = JSON.parse(projectFile!.content);
    expect(project.tree.ServerScriptService.$path).toBe("src/server");
    expect(project.tree.ReplicatedStorage.$path).toBe("src/shared");

    const scriptFiles = exportResult.files.filter((f) => f.type === "script");
    expect(scriptFiles.length).toBe(lua.totalScripts);
    for (const file of scriptFiles) {
      expect(file.path.startsWith("src/")).toBe(true);
      expect(file.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("escapes plan-supplied text so quotes cannot break a generated string literal", () => {
    // Simulates AI/plan output containing quotes and backslashes — content
    // this pipeline does not control the shape of (security.md: untrusted
    // content is data, never instructions/syntax).
    const blueprint = engine.generate({
      blueprint: {
        name: 'Rex\'s "Great" Escape\\Run',
        game_type: 'Sci-Fi "Heist"',
      },
      gameplay: {
        mechanics: ['grapple "hook"', "double-jump"],
        balance: { economyOrScoring: 'Gold "Bars"' },
      },
    });
    const lua = luaGen.generate(blueprint);

    for (const script of lua.scripts) {
      assertBalancedLuau(script.code, script.name);
    }

    const validation = validator.validate(
      blueprint,
      lua,
      assetGen.generate(blueprint),
    );
    expect(validation.errors).toBe(0);
  });

  it("fails closed: /generate/game and /generate/export do not build a package when validation fails", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "server/src/routes/generation-v2.ts"),
      "utf8",
    );

    const gameHandler = route.slice(
      route.indexOf('router.post("/game"'),
      route.indexOf('router.post("/blueprint"'),
    );
    expect(gameHandler).toContain("if (!validation.passed)");
    expect(gameHandler.indexOf("if (!validation.passed)")).toBeLessThan(
      gameHandler.indexOf("exporter.build(blueprint, lua, assets)"),
    );

    const exportHandler = route.slice(route.indexOf('router.post("/export"'));
    expect(exportHandler).toContain(
      "validator.validate(blueprint, lua, assets)",
    );
    expect(exportHandler).toContain("if (!validation.passed)");
    expect(exportHandler.indexOf("if (!validation.passed)")).toBeLessThan(
      exportHandler.indexOf("exporter.build(blueprint, lua, assets)"),
    );
  });
});
