import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  asLuauLongString,
  assertGitRevisionStable,
  assertStudioExitCode,
  buildStudioArguments,
  captureCleanGitRevision,
  launchStudio,
  parseStudioAcceptanceArgs,
  parseStudioAcceptanceOutput,
  publishAcceptanceEvidence,
  REQUIRED_STUDIO_ACCEPTANCE_CHECK_NAMES,
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
    expect(() =>
      parseStudioAcceptanceArgs(["--timeout-ms", "2147483648"]),
    ).toThrow(/must not exceed 2147483647/);
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
      checks: REQUIRED_STUDIO_ACCEPTANCE_CHECK_NAMES.map((name) => ({
        name,
        status: "PASS",
        detail: "verified",
      })),
    };
    const output = [
      "RAI_STUDIO_ACCEPTANCE_RESULT:not-json",
      `RAI_STUDIO_ACCEPTANCE_RESULT:${JSON.stringify(result)}`,
    ].join("\n");
    expect(parseStudioAcceptanceOutput(output)).toEqual(result);
    expect(() => parseStudioAcceptanceOutput("no result")).toThrow(
      /did not contain/,
    );
    expect(() =>
      parseStudioAcceptanceOutput(
        `RAI_STUDIO_ACCEPTANCE_RESULT:${JSON.stringify({ ...result, checks: [] })}`,
      ),
    ).toThrow(/complete passing check matrix/);
    expect(() =>
      parseStudioAcceptanceOutput(
        `RAI_STUDIO_ACCEPTANCE_RESULT:${JSON.stringify({
          ...result,
          checks: result.checks.map((check, index) =>
            index === 0 ? { ...check, status: "FAIL" } : check,
          ),
        })}`,
      ),
    ).toThrow(/complete passing check matrix/);
  });

  it("rejects unsuccessful exits and waits for a timed-out process to close", async () => {
    expect(() => assertStudioExitCode(0)).not.toThrow();
    expect(() => assertStudioExitCode(1)).toThrow(/exit code 1/);
    expect(() => assertStudioExitCode(null)).toThrow(/no exit code/);

    const childScript =
      process.platform === "win32"
        ? "setInterval(() => {}, 1000)"
        : "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)";
    await expect(
      launchStudio(process.execPath, ["-e", childScript], 100, 100),
    ).rejects.toThrow(/timed out after 100 ms/);
  });

  it("binds evidence to a clean revision and rejects a changed HEAD", async () => {
    const repository = await mkdtemp(join(tmpdir(), "studio-acceptance-git-"));
    try {
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: repository, stdio: "pipe" });
      git("init", "--quiet");
      git("config", "user.name", "Studio Acceptance Test");
      git("config", "user.email", "studio-acceptance@example.invalid");
      await writeFile(join(repository, "source.txt"), "first\n", "utf8");
      git("add", "source.txt");
      git("commit", "--quiet", "-m", "first");

      const revision = await captureCleanGitRevision(repository);
      expect(revision.commit).toMatch(/^[0-9a-f]{40}$/);
      await expect(
        assertGitRevisionStable(repository, revision),
      ).resolves.toBeUndefined();

      await writeFile(join(repository, "source.txt"), "dirty\n", "utf8");
      await expect(captureCleanGitRevision(repository)).rejects.toThrow(
        /requires a clean worktree/,
      );
      git("add", "source.txt");
      git("commit", "--quiet", "-m", "second");
      await expect(
        assertGitRevisionStable(repository, revision),
      ).rejects.toThrow(/HEAD changed/);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 15_000);

  it("publishes each completed run as one concurrency-safe evidence set", async () => {
    const root = await mkdtemp(join(tmpdir(), "studio-acceptance-publish-"));
    try {
      const createRun = async (name: string) => {
        const directory = join(root, name);
        await mkdir(directory);
        await Promise.all(
          ["studio-output.log", "result.json", "report.md"].map((file) =>
            writeFile(join(directory, file), `${name}:${file}\n`, "utf8"),
          ),
        );
        return directory;
      };
      const first = await createRun("first");
      const second = await createRun("second");
      const latest = join(root, "latest");

      const publications = await Promise.all([
        publishAcceptanceEvidence(first, latest),
        publishAcceptanceEvidence(second, latest),
      ]);

      const pointer = JSON.parse(
        await readFile(join(latest, "pointer.json"), "utf8"),
      ) as { runDirectory: string };
      const selectedRun = join(latest, pointer.runDirectory);
      const published = await Promise.all(
        ["studio-output.log", "result.json", "report.md"].map((file) =>
          readFile(join(selectedRun, file), "utf8"),
        ),
      );
      expect(
        published.every((value) => value.startsWith("first:")) ||
          published.every((value) => value.startsWith("second:")),
      ).toBe(true);
      await Promise.all(
        publications.map((publication) =>
          readFile(publication.resultPath, "utf8"),
        ),
      );

      const unsafeOutput = join(root, "unsafe-output");
      await mkdir(unsafeOutput);
      await writeFile(join(unsafeOutput, "keep.txt"), "keep\n", "utf8");
      await expect(
        publishAcceptanceEvidence(first, unsafeOutput),
      ).rejects.toThrow(
        /Refusing to publish into a non-evidence output directory/,
      );
      await expect(
        readFile(join(unsafeOutput, "keep.txt"), "utf8"),
      ).resolves.toBe("keep\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
