import { execFile, spawn } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  packageStudioPlugin,
  type StudioPluginPackageManifest,
} from "../package-studio-plugin";

const RESULT_PREFIX = "RAI_STUDIO_ACCEPTANCE_RESULT:";
const DEFAULT_TIMEOUT_MS = 120_000;
const REQUIRED_RUNTIME_SOURCES = [
  "src/utils/UITreeMaterializer.lua",
  "src/utils/WorldSceneMaterializer.lua",
  "src/utils/ArtifactLoader.lua",
] as const;

export type StudioAcceptanceTarget =
  | { mode: "baseplate" }
  | { mode: "local-place"; placeFile: string }
  | { mode: "published-place"; placeId: string; universeId: string };

export interface StudioAcceptanceCliOptions {
  studioPath?: string;
  outputDirectory?: string;
  timeoutMs: number;
  target: StudioAcceptanceTarget;
}

export interface StudioAcceptanceCheck {
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
}

export interface StudioSmokeResult {
  schemaVersion: 1;
  status: "PASS" | "FAIL";
  scope: "studio-engine-plugin-runtime";
  pluginVersion: string;
  checks: StudioAcceptanceCheck[];
}

interface StudioProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface CleanGitRevision {
  commit: string;
}

const EVIDENCE_FILES = [
  "studio-output.log",
  "result.json",
  "report.md",
] as const;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

async function gitOutput(
  repositoryRoot: string,
  args: string[],
): Promise<string> {
  return await new Promise((resolvePromise, rejectPromise) => {
    execFile(
      "git",
      args,
      { cwd: repositoryRoot, encoding: "utf8" },
      (error, stdout) => {
        if (error) rejectPromise(error);
        else resolvePromise(stdout.trim());
      },
    );
  });
}

export async function captureCleanGitRevision(
  repositoryRoot: string,
): Promise<CleanGitRevision> {
  const commit = await gitOutput(repositoryRoot, ["rev-parse", "HEAD"]);
  const worktreeStatus = await gitOutput(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--ignore-submodules=none",
  ]);
  if (worktreeStatus) {
    throw new Error(
      `Studio acceptance requires a clean worktree before reading sources:\n${worktreeStatus}`,
    );
  }
  const stableCommit = await gitOutput(repositoryRoot, ["rev-parse", "HEAD"]);
  if (stableCommit !== commit) {
    throw new Error(
      `Studio acceptance HEAD changed while capturing the source revision: expected ${commit}, found ${stableCommit}`,
    );
  }
  return { commit };
}

export async function assertGitRevisionStable(
  repositoryRoot: string,
  expected: CleanGitRevision,
): Promise<void> {
  const actual = await captureCleanGitRevision(repositoryRoot);
  if (actual.commit !== expected.commit) {
    throw new Error(
      `Studio acceptance HEAD changed during the run: expected ${expected.commit}, found ${actual.commit}`,
    );
  }
}

async function acquirePublishLock(
  lockDirectory: string,
): Promise<() => Promise<void>> {
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      await mkdir(lockDirectory);
      return async () => {
        await rm(lockDirectory, { recursive: true, force: true });
      };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      let lockAgeMs: number;
      try {
        lockAgeMs = Date.now() - (await stat(lockDirectory)).mtimeMs;
      } catch (statError) {
        if (errorCode(statError) === "ENOENT") continue;
        throw statError;
      }
      if (lockAgeMs > 60_000) {
        await rm(lockDirectory, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting to publish Studio acceptance evidence: ${lockDirectory}`,
        );
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
}

export async function publishAcceptanceEvidence(
  completedRunDirectory: string,
  outputDirectory: string,
): Promise<void> {
  const resolvedOutput = resolve(outputDirectory);
  if (resolve(completedRunDirectory) === resolvedOutput) {
    throw new Error(
      "Completed Studio run and published output must be separate",
    );
  }
  const outputParent = dirname(resolvedOutput);
  await mkdir(outputParent, { recursive: true });
  const stagingDirectory = await mkdtemp(
    join(outputParent, `.${basename(resolvedOutput)}.publish-`),
  );
  const lockDirectory = resolve(
    outputParent,
    `.${basename(resolvedOutput)}.publish-lock`,
  );
  const previousDirectory = `${resolvedOutput}.previous-${basename(stagingDirectory)}`;
  let releaseLock: (() => Promise<void>) | undefined;
  let previousMoved = false;
  try {
    for (const file of EVIDENCE_FILES) {
      await copyFile(
        resolve(completedRunDirectory, file),
        resolve(stagingDirectory, file),
      );
    }
    releaseLock = await acquirePublishLock(lockDirectory);
    try {
      const existingEntries = await readdir(resolvedOutput);
      const unexpectedEntries = existingEntries.filter(
        (entry) =>
          !EVIDENCE_FILES.includes(entry as (typeof EVIDENCE_FILES)[number]),
      );
      if (unexpectedEntries.length > 0) {
        throw new Error(
          `Refusing to replace a non-evidence output directory (${unexpectedEntries.join(", ")}): ${resolvedOutput}`,
        );
      }
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    try {
      await rename(resolvedOutput, previousDirectory);
      previousMoved = true;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    await rename(stagingDirectory, resolvedOutput);
    if (previousMoved) {
      await rm(previousDirectory, { recursive: true, force: true });
    }
  } catch (error) {
    if (previousMoved && !(await existingFile(resolvedOutput))) {
      await rename(previousDirectory, resolvedOutput);
    }
    throw error;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
    if (releaseLock) await releaseLock();
  }
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function requirePositiveInteger(value: string, option: string): number {
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new Error(`${option} must be a positive integer`);
  }
  return Number(value);
}

export function parseStudioAcceptanceArgs(
  args: string[],
): StudioAcceptanceCliOptions {
  let studioPath: string | undefined;
  let outputDirectory: string | undefined;
  let placeFile: string | undefined;
  let placeId: string | undefined;
  let universeId: string | undefined;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    switch (option) {
      case "--studio-path":
        studioPath = requireValue(args, index, option);
        index += 1;
        break;
      case "--output-dir":
        outputDirectory = requireValue(args, index, option);
        index += 1;
        break;
      case "--place-file":
        placeFile = requireValue(args, index, option);
        index += 1;
        break;
      case "--place-id":
        placeId = requireValue(args, index, option);
        index += 1;
        break;
      case "--universe-id":
        universeId = requireValue(args, index, option);
        index += 1;
        break;
      case "--timeout-ms":
        timeoutMs = requirePositiveInteger(
          requireValue(args, index, option),
          option,
        );
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${option}`);
    }
  }

  if (placeFile && (placeId || universeId)) {
    throw new Error(
      "Use either --place-file or the --place-id/--universe-id pair, not both",
    );
  }
  if ((placeId && !universeId) || (!placeId && universeId)) {
    throw new Error("--place-id and --universe-id must be provided together");
  }
  if (placeId && !/^\d+$/.test(placeId)) {
    throw new Error("--place-id must contain digits only");
  }
  if (universeId && !/^\d+$/.test(universeId)) {
    throw new Error("--universe-id must contain digits only");
  }

  const target: StudioAcceptanceTarget = placeFile
    ? { mode: "local-place", placeFile: resolve(placeFile) }
    : placeId && universeId
      ? { mode: "published-place", placeId, universeId }
      : { mode: "baseplate" };

  return {
    studioPath,
    outputDirectory,
    timeoutMs,
    target,
  };
}

async function existingFile(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveStudioExecutable(
  override?: string,
): Promise<string> {
  const explicit = override ?? process.env.ROBLOX_STUDIO_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!(await existingFile(resolved))) {
      throw new Error(`Roblox Studio executable not found: ${resolved}`);
    }
    return resolved;
  }

  if (process.platform === "darwin") {
    const macPath =
      "/Applications/RobloxStudio.app/Contents/MacOS/RobloxStudio";
    if (await existingFile(macPath)) return macPath;
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const versionsRoot = resolve(localAppData, "Roblox", "Versions");
      try {
        const versions = await readdir(versionsRoot, { withFileTypes: true });
        const candidates = await Promise.all(
          versions
            .filter((entry) => entry.isDirectory())
            .map(async (entry) => {
              const path = resolve(
                versionsRoot,
                entry.name,
                "RobloxStudioBeta.exe",
              );
              if (!(await existingFile(path))) return undefined;
              return { path, modifiedAt: (await stat(path)).mtimeMs };
            }),
        );
        const latest = candidates
          .filter((candidate) => candidate !== undefined)
          .sort((left, right) => right.modifiedAt - left.modifiedAt)[0];
        if (latest) return latest.path;
      } catch {
        // Fall through to the actionable error below.
      }
    }
  }

  throw new Error(
    "Roblox Studio was not found. Install Studio or set ROBLOX_STUDIO_PATH.",
  );
}

export function buildStudioArguments(
  scriptPath: string,
  outputPath: string,
  target: StudioAcceptanceTarget,
): string[] {
  const args = [
    "--task",
    "RunScript",
    "--runScriptFile",
    resolve(scriptPath),
    "--outputFile",
    resolve(outputPath),
    "--quitAfterExecution",
  ];

  if (target.mode === "local-place") {
    args.push("--localPlaceFile", resolve(target.placeFile));
  } else if (target.mode === "published-place") {
    args.push("--placeId", target.placeId, "--universeId", target.universeId);
  }

  return args;
}

export function asLuauLongString(value: string): string {
  for (let level = 0; level < 20; level += 1) {
    const equals = "=".repeat(level);
    const closing = `]${equals}]`;
    if (!value.includes(closing)) {
      return `[${equals}[${value}]${equals}]`;
    }
  }
  throw new Error("Unable to encode source as a Luau long string");
}

export function renderStudioSmokeScript(
  template: string,
  manifest: StudioPluginPackageManifest,
  sources: ReadonlyMap<string, string>,
): string {
  const replacements = new Map<string, string>([
    ["__EXPECTED_PLUGIN_VERSION__", JSON.stringify(manifest.pluginVersion)],
    [
      "__UI_TREE_MATERIALIZER_SOURCE__",
      asLuauLongString(sources.get("src/utils/UITreeMaterializer.lua") ?? ""),
    ],
    [
      "__WORLD_SCENE_MATERIALIZER_SOURCE__",
      asLuauLongString(
        sources.get("src/utils/WorldSceneMaterializer.lua") ?? "",
      ),
    ],
    [
      "__ARTIFACT_LOADER_SOURCE__",
      asLuauLongString(sources.get("src/utils/ArtifactLoader.lua") ?? ""),
    ],
  ]);

  let rendered = template;
  for (const sourcePath of REQUIRED_RUNTIME_SOURCES) {
    if (!sources.get(sourcePath)) {
      throw new Error(`Missing Studio runtime source: ${sourcePath}`);
    }
  }
  for (const [placeholder, value] of replacements) {
    if (!rendered.includes(placeholder)) {
      throw new Error(`Studio smoke template is missing ${placeholder}`);
    }
    rendered = rendered.replaceAll(placeholder, value);
  }
  if (/__[A-Z0-9_]+__/.test(rendered)) {
    throw new Error("Studio smoke template contains an unresolved placeholder");
  }
  return rendered;
}

export function parseStudioAcceptanceOutput(output: string): StudioSmokeResult {
  const matchingLine = output
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.includes(RESULT_PREFIX));
  if (!matchingLine) {
    throw new Error(
      "Roblox Studio output did not contain an acceptance result",
    );
  }

  const json = matchingLine.slice(
    matchingLine.indexOf(RESULT_PREFIX) + RESULT_PREFIX.length,
  );
  const result = JSON.parse(json) as Partial<StudioSmokeResult>;
  if (
    result.schemaVersion !== 1 ||
    result.scope !== "studio-engine-plugin-runtime" ||
    (result.status !== "PASS" && result.status !== "FAIL") ||
    typeof result.pluginVersion !== "string" ||
    !Array.isArray(result.checks)
  ) {
    throw new Error("Roblox Studio returned an invalid acceptance result");
  }
  for (const check of result.checks) {
    if (
      !check ||
      typeof check.name !== "string" ||
      (check.status !== "PASS" && check.status !== "FAIL") ||
      typeof check.detail !== "string"
    ) {
      throw new Error("Roblox Studio returned an invalid acceptance check");
    }
  }
  return result as StudioSmokeResult;
}

async function launchStudio(
  executable: string,
  args: string[],
  timeoutMs: number,
): Promise<StudioProcessResult> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      rejectPromise(
        new Error(`Roblox Studio acceptance timed out after ${timeoutMs} ms`),
      );
    }, timeoutMs);

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise({ exitCode, stdout, stderr });
    });
  });
}

async function waitForOutput(path: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const output = await readFile(path, "utf8");
      if (output.includes(RESULT_PREFIX)) return output;
    } catch {
      // Studio creates the output file only after the script starts.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Timed out waiting for the Roblox Studio output file");
}

function renderMarkdownReport(report: {
  generatedAt: string;
  gitCommit: string;
  studioExecutable: string;
  target: StudioAcceptanceTarget;
  manifest: StudioPluginPackageManifest;
  result: StudioSmokeResult;
}): string {
  const target =
    report.target.mode === "baseplate"
      ? "default empty Baseplate"
      : report.target.mode === "local-place"
        ? `local place: ${report.target.placeFile}`
        : `published place ${report.target.placeId} in universe ${report.target.universeId}`;
  const rows = report.result.checks.map(
    (check) =>
      `| ${check.name.replaceAll("|", "\\|")} | ${check.status} | ${check.detail.replaceAll("|", "\\|").replaceAll("\n", " ")} |`,
  );

  return [
    "# Roblox Studio automated acceptance",
    "",
    `**Verdict:** ${report.result.status}`,
    "",
    `- Generated: ${report.generatedAt}`,
    `- Git commit: ${report.gitCommit}`,
    `- Plugin version: ${report.manifest.pluginVersion}`,
    `- Bundle SHA-256: ${report.manifest.bundleSha256}`,
    `- Studio executable: ${report.studioExecutable}`,
    `- Target: ${target}`,
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "## Evidence boundary",
    "",
    "This report proves that the exact canonical materializer sources execute inside the real Roblox Studio engine and satisfy the listed deterministic fixtures. It does not prove a live authenticated backend connection, an EXPORT_PROJECT lifecycle, plugin-panel visuals, multiplayer behavior, subjective UX quality, or publishing. Those remain separate integration/operator evidence.",
    "",
  ].join("\n");
}

export async function runStudioAcceptance(
  options: StudioAcceptanceCliOptions,
  repositoryRoot = resolve(process.cwd()),
): Promise<StudioSmokeResult> {
  const gitRevision = await captureCleanGitRevision(repositoryRoot);
  const studioExecutable = await resolveStudioExecutable(options.studioPath);
  if (
    options.target.mode === "local-place" &&
    !(await existingFile(options.target.placeFile))
  ) {
    throw new Error(`Local place file not found: ${options.target.placeFile}`);
  }

  const outputDirectory = resolve(
    options.outputDirectory ??
      resolve(repositoryRoot, "artifacts/studio-acceptance/latest"),
  );
  const resultPath = resolve(outputDirectory, "result.json");
  const reportPath = resolve(outputDirectory, "report.md");

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "roblox-ai-studio-acceptance-"),
  );
  try {
    const studioOutputPath = resolve(temporaryDirectory, "studio-output.log");
    const packageResult = await packageStudioPlugin({
      repositoryRoot,
      outputDirectory: resolve(temporaryDirectory, "package"),
    });
    const template = await readFile(
      resolve(
        repositoryRoot,
        "scripts/studio-acceptance/studio-smoke.template.luau",
      ),
      "utf8",
    );
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
    await assertGitRevisionStable(repositoryRoot, gitRevision);
    const smokeScript = renderStudioSmokeScript(
      template,
      packageResult.manifest,
      sources,
    );
    const smokeScriptPath = resolve(temporaryDirectory, "studio-smoke.luau");
    await writeFile(smokeScriptPath, smokeScript, "utf8");

    const studioArguments = buildStudioArguments(
      smokeScriptPath,
      studioOutputPath,
      options.target,
    );
    const processResult = await launchStudio(
      studioExecutable,
      studioArguments,
      options.timeoutMs,
    );
    const studioOutput = await waitForOutput(
      studioOutputPath,
      Math.min(options.timeoutMs, 30_000),
    );
    const result = parseStudioAcceptanceOutput(studioOutput);
    if (result.pluginVersion !== packageResult.manifest.pluginVersion) {
      throw new Error(
        `Studio result used plugin ${result.pluginVersion}, expected ${packageResult.manifest.pluginVersion}`,
      );
    }
    await assertGitRevisionStable(repositoryRoot, gitRevision);

    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      scope: "studio-engine-plugin-runtime",
      gitCommit: gitRevision.commit,
      studioExecutable,
      studioExitCode: processResult.exitCode,
      target: options.target,
      pluginPackage: {
        version: packageResult.manifest.pluginVersion,
        protocolVersion: packageResult.manifest.protocolVersion,
        bundleSha256: packageResult.manifest.bundleSha256,
        bundleSizeBytes: packageResult.manifest.bundleSizeBytes,
        sourceCount: packageResult.manifest.sources.length,
      },
      result,
      processOutput: {
        stdout: processResult.stdout,
        stderr: processResult.stderr,
      },
      evidenceBoundary: [
        "No live backend authentication or EXPORT_PROJECT lifecycle was exercised.",
        "No publishing operation exists in this runner.",
        "Subjective UX and multiplayer acceptance require separate evidence.",
      ],
    };
    const completedRunDirectory = resolve(temporaryDirectory, "evidence");
    await mkdir(completedRunDirectory);
    await copyFile(
      studioOutputPath,
      resolve(completedRunDirectory, "studio-output.log"),
    );
    await writeFile(
      resolve(completedRunDirectory, "result.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      resolve(completedRunDirectory, "report.md"),
      renderMarkdownReport({
        generatedAt: report.generatedAt,
        gitCommit: report.gitCommit,
        studioExecutable,
        target: options.target,
        manifest: packageResult.manifest,
        result,
      }),
      "utf8",
    );
    await publishAcceptanceEvidence(completedRunDirectory, outputDirectory);

    console.log(`Roblox Studio automated acceptance: ${result.status}`);
    console.log(`Result: ${resultPath}`);
    console.log(`Report: ${reportPath}`);
    if (result.status !== "PASS") process.exitCode = 1;
    return result;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const options = parseStudioAcceptanceArgs(process.argv.slice(2));
  await runStudioAcceptance(options);
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
