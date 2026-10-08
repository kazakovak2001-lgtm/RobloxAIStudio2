/**
 * run-generation-acceptance.ts
 *
 * GEN-VIABILITY-2. Proves the exact path: real canonical generation
 * (GameBlueprintEngine -> LuaGenerator -> AssetGenerator ->
 * GameValidationEngine) -> the RobloxExportArtifactAdapter -> the existing,
 * already-shipped ArtifactLoader.lua running inside a real headless Roblox
 * Studio process. Reuses resolveStudioExecutable/buildStudioArguments/
 * launchStudio/asLuauLongString from run-studio-acceptance.ts rather than
 * re-implementing Studio process control.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  asLuauLongString,
  buildStudioArguments,
  launchStudio,
  resolveStudioExecutable,
  type StudioAcceptanceTarget,
} from "./run-studio-acceptance";
import { GameBlueprintEngine } from "../../server/src/generation/blueprint/GameBlueprintEngine";
import { LuaGenerator } from "../../server/src/generation/lua/LuaGenerator";
import { AssetGenerator } from "../../server/src/generation/assets/AssetGenerator";
import { GameValidationEngine } from "../../server/src/generation/validation/GameValidationEngine";
import { buildStudioLuaArtifactContent } from "../../server/src/studio/import/RobloxExportArtifactAdapter";

const RESULT_PREFIX = "RAI_GENERATION_ACCEPTANCE_RESULT:";
const REQUIRED_RUNTIME_SOURCES = [
  "src/utils/ArtifactLoader.lua",
  "src/utils/UITreeMaterializer.lua",
  "src/utils/WorldSceneMaterializer.lua",
] as const;

async function waitForOutput(path: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const output = await readFile(path, "utf8");
      if (output.includes(RESULT_PREFIX)) return output;
    } catch {
      // Studio creates the output file only after the script starts.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for the Roblox Studio output file");
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(process.cwd());
  const timeoutMs = Number(process.env.GEN_ACCEPTANCE_TIMEOUT_MS ?? 90_000);

  console.log("Generating a minimal game through the real canonical path...");
  const blueprint = new GameBlueprintEngine().generate({});
  const lua = new LuaGenerator().generate(blueprint);
  const assets = new AssetGenerator().generate(blueprint);
  const validation = new GameValidationEngine().validate(
    blueprint,
    lua,
    assets,
  );
  if (!validation.passed) {
    throw new Error(
      `Generated game did not pass validation, refusing to attempt Studio import: ${JSON.stringify(validation.issues)}`,
    );
  }
  console.log(`Validation passed (score ${validation.score}).`);

  const luaArtifactContent = buildStudioLuaArtifactContent(lua);

  const sources = new Map<string, string>();
  for (const sourcePath of REQUIRED_RUNTIME_SOURCES) {
    sources.set(
      sourcePath,
      await readFile(
        resolve(repositoryRoot, "studio-plugin", sourcePath),
        "utf8",
      ),
    );
  }

  const templatePath = resolve(
    repositoryRoot,
    "scripts/studio-acceptance/generated-game-smoke.template.luau",
  );
  const template = await readFile(templatePath, "utf8");

  let rendered = template
    .replaceAll(
      "__ARTIFACT_LOADER_SOURCE__",
      asLuauLongString(sources.get("src/utils/ArtifactLoader.lua") ?? ""),
    )
    .replaceAll(
      "__UI_TREE_MATERIALIZER_SOURCE__",
      asLuauLongString(sources.get("src/utils/UITreeMaterializer.lua") ?? ""),
    )
    .replaceAll(
      "__WORLD_SCENE_MATERIALIZER_SOURCE__",
      asLuauLongString(
        sources.get("src/utils/WorldSceneMaterializer.lua") ?? "",
      ),
    )
    .replaceAll(
      "__LUA_ARTIFACT_CONTENT_JSON__",
      asLuauLongString(JSON.stringify(luaArtifactContent)),
    )
    .replaceAll(
      "__MECHANIC_NAME__",
      JSON.stringify(blueprint.mechanics[0] ?? "objective"),
    );

  if (/__[A-Z0-9_]+__/.test(rendered)) {
    throw new Error(
      "Generated-game smoke template has an unresolved placeholder",
    );
  }

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "roblox-ai-generation-acceptance-"),
  );
  try {
    const scriptPath = resolve(temporaryDirectory, "generated-game-smoke.luau");
    await writeFile(scriptPath, rendered, "utf8");
    const outputPath = resolve(temporaryDirectory, "studio-output.log");

    const studioExecutable = await resolveStudioExecutable();
    console.log(`Using Studio executable: ${studioExecutable}`);
    const target: StudioAcceptanceTarget = { mode: "baseplate" };
    const args = buildStudioArguments(scriptPath, outputPath, target);

    console.log(`Launching headless Studio (timeout ${timeoutMs}ms)...`);
    const processResult = await launchStudio(studioExecutable, args, timeoutMs);
    console.log(`Studio exited with code ${processResult.exitCode}`);
    if (processResult.stderr.trim()) {
      console.log(`stderr:\n${processResult.stderr}`);
    }

    const output = await waitForOutput(outputPath, Math.min(timeoutMs, 30_000));
    const line = output
      .split(/\r?\n/)
      .reverse()
      .find((l) => l.includes(RESULT_PREFIX));
    if (!line) {
      throw new Error(
        "Studio output did not contain a generation acceptance result",
      );
    }
    const json = line.slice(line.indexOf(RESULT_PREFIX) + RESULT_PREFIX.length);
    const result = JSON.parse(json);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "PASS") process.exitCode = 1;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const currentModulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentModulePath) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exitCode = 1;
  });
}
