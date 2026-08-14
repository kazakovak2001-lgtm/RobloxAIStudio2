import { describe, expect, it } from "vitest";

import {
  asLuauLongString,
  buildStudioArguments,
  parseStudioAcceptanceArgs,
  parseStudioAcceptanceOutput,
  renderStudioSmokeScript,
} from "../../../scripts/studio-acceptance/run-studio-acceptance";
import type { StudioPluginPackageManifest } from "../../../scripts/package-studio-plugin";

const manifest: StudioPluginPackageManifest = {
  formatVersion: 1,
  pluginName: "RobloxAIStudioPlugin",
  pluginVersion: "1.11.0",
  protocolVersion: "1.0.0",
  entrypoint: "plugin.lua",
  bundleFile: "plugin.rbxmx",
  bundleSha256: "a".repeat(64),
  bundleSizeBytes: 10,
  sources: [],
};

describe("Roblox Studio acceptance runner", () => {
  it("defaults to an isolated Baseplate and accepts only explicit place targets", () => {
    expect(parseStudioAcceptanceArgs([])).toMatchObject({
      timeoutMs: 120_000,
      target: { mode: "baseplate" },
    });
    expect(
      parseStudioAcceptanceArgs(["--place-id", "123", "--universe-id", "456"]),
    ).toMatchObject({
      target: { mode: "published-place", placeId: "123", universeId: "456" },
    });
    expect(() => parseStudioAcceptanceArgs(["--place-id", "123"])).toThrow(
      /provided together/,
    );
    expect(() => parseStudioAcceptanceArgs(["--publish"])).toThrow(
      /Unknown option/,
    );
  });

  it("builds only documented RunScript arguments and never adds publishing", () => {
    const args = buildStudioArguments("smoke.luau", "studio.log", {
      mode: "published-place",
      placeId: "123",
      universeId: "456",
    });
    expect(args).toContain("RunScript");
    expect(args).toContain("--quitAfterExecution");
    expect(args).toContain("--placeId");
    expect(args).toContain("--universeId");
    expect(args.join(" ").toLowerCase()).not.toContain("publish");
  });

  it("renders exact Lua sources even when they contain long-string delimiters", () => {
    const sources = new Map([
      ["src/utils/UITreeMaterializer.lua", "return { value = ']]' }"],
      ["src/utils/WorldSceneMaterializer.lua", "return {}"],
      ["src/utils/ArtifactLoader.lua", "return {}"],
    ]);
    const template = [
      "local version = __EXPECTED_PLUGIN_VERSION__",
      "local ui = __UI_TREE_MATERIALIZER_SOURCE__",
      "local world = __WORLD_SCENE_MATERIALIZER_SOURCE__",
      "local loader = __ARTIFACT_LOADER_SOURCE__",
    ].join("\n");
    const rendered = renderStudioSmokeScript(template, manifest, sources);
    expect(rendered).toContain('local version = "1.11.0"');
    expect(rendered).toContain("return { value = ']]' }");
    expect(rendered).not.toMatch(/__[A-Z0-9_]+__/);
    expect(asLuauLongString("]]")).toBe("[=[]]]=]");
  });

  it("uses the final structured Studio result and validates its contract", () => {
    const result = {
      schemaVersion: 1,
      status: "PASS",
      scope: "studio-engine-plugin-runtime",
      pluginVersion: "1.11.0",
      checks: [{ name: "engine", status: "PASS", detail: "verified" }],
    };
    const output = [
      "RAI_STUDIO_ACCEPTANCE_RESULT:not-json",
      `RAI_STUDIO_ACCEPTANCE_RESULT:${JSON.stringify(result)}`,
    ].join("\n");
    expect(parseStudioAcceptanceOutput(output)).toEqual(result);
    expect(() => parseStudioAcceptanceOutput("no result")).toThrow(
      /did not contain/,
    );
  });
});
