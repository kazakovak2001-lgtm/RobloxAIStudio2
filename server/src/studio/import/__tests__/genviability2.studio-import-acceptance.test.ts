import { describe, expect, it } from "vitest";

import { GameBlueprintEngine } from "../../../generation/blueprint/GameBlueprintEngine";
import { LuaGenerator } from "../../../generation/lua/LuaGenerator";
import { AssetGenerator } from "../../../generation/assets/AssetGenerator";
import { GameValidationEngine } from "../../../generation/validation/GameValidationEngine";
import { getPlayableLuaIssues } from "../../../types/playableLua";
import { buildStudioLuaArtifactContent } from "../RobloxExportArtifactAdapter";

/**
 * GEN-VIABILITY-2. Mirrors `ArtifactLoader.lua`'s own path-resolution rules
 * (`_resolveRoot`, `_scriptClass`, `_assertPlacement`) in TypeScript, so this
 * boundary is checked without needing a live Studio process. The narrowest
 * practical proof that the adapter's output is legal input to the existing,
 * already-shipped materializer.
 */
const KNOWN_ROOTS = new Set([
  "ServerScriptService",
  "ReplicatedStorage",
  "ServerStorage",
  "StarterGui",
  "Workspace",
  "StarterPlayer",
  "StarterPlayerScripts",
  "StarterCharacterScripts",
]);

const SCRIPT_ONLY_ROOTS = new Set([
  "ServerScriptService",
  "ServerStorage",
  "Workspace",
]);
const LOCAL_SCRIPT_ONLY_ROOTS = new Set([
  "StarterGui",
  "StarterPlayer",
  "StarterPlayerScripts",
  "StarterCharacterScripts",
]);

function studioScriptClass(
  path: string,
): "Script" | "LocalScript" | "ModuleScript" {
  if (path.endsWith(".server.lua")) return "Script";
  if (path.endsWith(".client.lua")) return "LocalScript";
  return "ModuleScript";
}

describe("GENVIABILITY-2 generated game reaches the existing Studio import path", () => {
  const blueprintEngine = new GameBlueprintEngine();
  const luaGen = new LuaGenerator();
  const assetGen = new AssetGenerator();
  const validator = new GameValidationEngine();

  it("a minimal generated game satisfies the existing playable-Lua contract that already gates Studio delivery", () => {
    const blueprint = blueprintEngine.generate({});
    const lua = luaGen.generate(blueprint);
    const assets = assetGen.generate(blueprint);

    // The exact, already-shipped contract used by GenerationArtifactRecorder
    // to gate the other pipeline's Studio delivery — not a new invented
    // check for this pipeline.
    const playableIssues = getPlayableLuaIssues(
      lua.scripts.map((s) => ({ path: s.path, content: s.code })),
    );
    expect(playableIssues).toEqual([]);

    // GameValidationEngine (the validator/tester stage this pipeline already
    // runs before export) now enforces the same contract.
    const validation = validator.validate(blueprint, lua, assets);
    expect(validation.passed).toBe(true);
    expect(validation.issues.filter((i) => i.code === "NOT_PLAYABLE")).toEqual(
      [],
    );

    // Required game structure named in the acceptance criteria, read
    // straight from the generated server script's own source: it builds
    // real Workspace geometry (a SpawnLocation a player can spawn on) and
    // wires at least one gameplay mechanic (a Touched interaction).
    const gameManager = lua.scripts.find((s) => s.name === "GameManager");
    expect(gameManager).toBeDefined();
    expect(gameManager!.code).toContain('Instance.new("SpawnLocation")');
    expect(gameManager!.code).toContain("workspace");
    expect(gameManager!.code).toMatch(/Touched\s*:\s*Connect\s*\(/);

    const clientController = lua.scripts.find(
      (s) => s.name === "ClientController",
    );
    expect(clientController).toBeDefined();
    expect(clientController!.code).toContain('Instance.new("ScreenGui")');
    expect(clientController!.code).toContain("PlayerGui");
  });

  it("the adapter's output is legal input to the existing ArtifactLoader (root + script-class rules)", () => {
    const blueprint = blueprintEngine.generate({});
    const lua = luaGen.generate(blueprint);
    const artifact = buildStudioLuaArtifactContent(lua);

    expect(artifact.scripts.length).toBe(lua.totalScripts);

    for (const script of artifact.scripts) {
      const [root] = script.path.split("/");
      expect(KNOWN_ROOTS.has(root), `unknown script root: ${root}`).toBe(true);

      const scriptClass = studioScriptClass(script.path);
      if (scriptClass === "Script") {
        expect(
          SCRIPT_ONLY_ROOTS.has(root),
          `${script.path} would be refused: a Script cannot run under ${root}`,
        ).toBe(true);
      }
      if (scriptClass === "LocalScript") {
        expect(
          LOCAL_SCRIPT_ONLY_ROOTS.has(root),
          `${script.path} would be refused: a LocalScript cannot run under ${root}`,
        ).toBe(true);
      }
    }

    // Every server/client script the pipeline produces is placed as a real,
    // auto-running Script/LocalScript, not an inert ModuleScript — the
    // classification a missing `.server.lua`/`.client.lua` suffix would
    // otherwise silently fall back to.
    const gameManagerEntry = artifact.scripts.find((s) =>
      s.path.startsWith("ServerScriptService/GameManager"),
    );
    expect(gameManagerEntry?.path.endsWith(".server.lua")).toBe(true);
    const clientEntry = artifact.scripts.find((s) =>
      s.path.startsWith("StarterPlayerScripts/ClientController"),
    );
    expect(clientEntry?.path.endsWith(".client.lua")).toBe(true);
  });
});
