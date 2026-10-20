/**
 * RobloxExportArtifactAdapter.ts
 *
 * GEN-VIABILITY-2. `RobloxExportBuilder`'s Rojo-shaped export (goal ->
 * blueprint -> lua -> assets -> validation -> export, routes/generation-v2.ts)
 * has no consumer anywhere in the repo: nothing wires it into
 * `ArtifactStore`/`StudioIntegrationManager`, the mechanism the Studio plugin
 * actually imports through. This adapter is that missing, narrow link — it
 * converts `LuaGenerator`'s output into the exact wire shape
 * `studio-plugin/src/utils/ArtifactLoader.lua`'s `_loadLuaArtifact` already
 * accepts, so the same, already-shipped materializer can place the generated
 * scripts into a real Studio DataModel. Nothing about the materializer or the
 * generation pipeline changes here.
 */

import type {
  LuaGenerationResult,
  LuaScript,
} from "../../generation/lua/LuaGenerator";

export interface StudioLuaScriptEntry {
  path: string;
  content: string;
}

export interface StudioLuaArtifactContent {
  scripts: StudioLuaScriptEntry[];
}

/**
 * `ArtifactLoader:_scriptClass` picks Script/LocalScript/ModuleScript purely
 * from the filename suffix. `LuaGenerator`'s own `path` field
 * (`ServerScriptService/GameManager`) carries no suffix, so the adapter adds
 * exactly the one `_scriptClass` recognizes for each script's declared type.
 */
function classSuffix(type: LuaScript["type"]): string {
  switch (type) {
    case "server":
      return ".server.lua";
    case "client":
      return ".client.lua";
    case "shared":
      return ".lua";
  }
}

export function buildStudioLuaArtifactContent(
  lua: LuaGenerationResult,
): StudioLuaArtifactContent {
  return {
    scripts: lua.scripts.map((script) => ({
      path: `${script.path}${classSuffix(script.type)}`,
      content: script.code,
    })),
  };
}
