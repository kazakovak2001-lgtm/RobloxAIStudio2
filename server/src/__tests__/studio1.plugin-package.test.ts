import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVE_PLUGIN_SOURCES,
  packageStudioPlugin,
  type StudioPluginPackageManifest,
} from "../../../scripts/package-studio-plugin";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("STUDIO-1e deterministic Roblox plugin package", () => {
  it("packages only the canonical active source hierarchy as an installable model", async () => {
    const outputDirectory = await createTemporaryDirectory(
      "studio-plugin-package-",
    );
    const result = await packageStudioPlugin({
      repositoryRoot: resolve(process.cwd()),
      outputDirectory,
    });

    const bundle = await readFile(result.bundlePath, "utf8");
    const manifestContent = await readFile(result.manifestPath, "utf8");
    const checksums = await readFile(result.checksumsPath, "utf8");
    const manifest = JSON.parse(manifestContent) as StudioPluginPackageManifest;

    expect(result.bundlePath).toMatch(/RobloxAIStudioPlugin-v1\.11\.2\.rbxmx$/);
    expect(manifest).toMatchObject({
      formatVersion: 1,
      pluginName: "RobloxAIStudioPlugin",
      pluginVersion: "1.11.2",
      protocolVersion: "1.0.0",
      entrypoint: "plugin.lua",
      bundleFile: "RobloxAIStudioPlugin-v1.11.2.rbxmx",
    });
    expect(manifest.sources).toHaveLength(ACTIVE_PLUGIN_SOURCES.length);
    expect(manifest.sources.map((source) => source.sourcePath)).toEqual(
      [...ACTIVE_PLUGIN_SOURCES]
        .map((source) => source.sourcePath)
        .sort((left, right) => left.localeCompare(right)),
    );
    expect(
      manifest.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)),
    ).toBe(true);
    expect(
      manifest.sources.every((source) =>
        source.instancePath.startsWith("RobloxAIStudioPlugin."),
      ),
    ).toBe(true);

    expect(bundle).toContain('<Item class="Model" referent="RBX000000">');
    expect(bundle).toContain(
      '<string name="Name">RobloxAIStudioPlugin</string>',
    );
    expect(bundle).toContain('<Item class="Script"');
    expect(bundle).toContain('<string name="Name">plugin</string>');
    expect(bundle).toContain('<Item class="ModuleScript"');
    expect(bundle).toContain('<string name="Name">Config</string>');
    expect(bundle).toContain('<string name="Name">SyncManager</string>');
    expect(bundle).toContain('<string name="Name">ArtifactLoader</string>');
    expect(bundle).toContain("COMMAND_POLL_INTERVAL");
    expect(bundle).not.toContain("_legacy");
    expect(bundle).not.toContain("RuntimeValidator");

    expect(manifest.bundleSha256).toBe(sha256(bundle));
    expect(manifest.bundleSizeBytes).toBe(Buffer.byteLength(bundle, "utf8"));
    expect(checksums).toContain(
      `${manifest.bundleSha256}  ${manifest.bundleFile}`,
    );
    expect(checksums).toContain(
      `${sha256(manifestContent)}  RobloxAIStudioPlugin-v1.11.2.manifest.json`,
    );
  });

  it("uses Roblox-safe POST headers and exposes desktop request failures", async () => {
    const connectorSource = await readFile(
      resolve(process.cwd(), "studio-plugin/src/services/StudioConnector.lua"),
      "utf8",
    );

    expect(connectorSource).toContain("Enum.HttpContentType.ApplicationJson");
    expect(connectorSource).not.toContain('["Content-Type"]');
    expect(connectorSource).toContain("if next(headers) then");
    expect(connectorSource).toContain(
      '[AI Studio HTTP] POST " .. path .. " failed:',
    );
  });

  it("produces byte-identical bundles and manifests from unchanged sources", async () => {
    const firstOutput = await createTemporaryDirectory(
      "studio-plugin-package-a-",
    );
    const secondOutput = await createTemporaryDirectory(
      "studio-plugin-package-b-",
    );

    const first = await packageStudioPlugin({
      repositoryRoot: resolve(process.cwd()),
      outputDirectory: firstOutput,
    });
    const second = await packageStudioPlugin({
      repositoryRoot: resolve(process.cwd()),
      outputDirectory: secondOutput,
    });

    await expect(readFile(first.bundlePath, "utf8")).resolves.toBe(
      await readFile(second.bundlePath, "utf8"),
    );
    await expect(readFile(first.manifestPath, "utf8")).resolves.toBe(
      await readFile(second.manifestPath, "utf8"),
    );
    await expect(readFile(first.checksumsPath, "utf8")).resolves.toBe(
      await readFile(second.checksumsPath, "utf8"),
    );
    // Packages the whole plugin twice, and the module list grows with each
    // materialization slice, so the default 5s is tight under a parallel run.
  }, 20000);
});
