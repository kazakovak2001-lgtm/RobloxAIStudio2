import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface PluginSourceDefinition {
  sourcePath: string;
  className: "Script" | "ModuleScript";
}

export interface PackagedPluginSource extends PluginSourceDefinition {
  instancePath: string;
  sha256: string;
  sizeBytes: number;
}

export interface StudioPluginPackageManifest {
  formatVersion: 1;
  pluginName: string;
  pluginVersion: string;
  protocolVersion: string;
  entrypoint: string;
  bundleFile: string;
  bundleSha256: string;
  bundleSizeBytes: number;
  sources: PackagedPluginSource[];
}

export interface StudioPluginPackageResult {
  bundlePath: string;
  manifestPath: string;
  checksumsPath: string;
  manifest: StudioPluginPackageManifest;
}

interface PackageOptions {
  repositoryRoot?: string;
  outputDirectory?: string;
}

interface InstanceNode {
  name: string;
  className: "Model" | "Folder" | "Script" | "ModuleScript";
  source?: string;
  children: InstanceNode[];
}

const PLUGIN_NAME = "RobloxAIStudioPlugin";
const PLUGIN_ROOT = "studio-plugin";

export const ACTIVE_PLUGIN_SOURCES: readonly PluginSourceDefinition[] = [
  { sourcePath: "plugin.lua", className: "Script" },
  { sourcePath: "src/core/Config.lua", className: "ModuleScript" },
  { sourcePath: "src/core/Events.lua", className: "ModuleScript" },
  {
    sourcePath: "src/services/ConnectionManager.lua",
    className: "ModuleScript",
  },
  {
    sourcePath: "src/services/StudioConnector.lua",
    className: "ModuleScript",
  },
  { sourcePath: "src/services/SyncManager.lua", className: "ModuleScript" },
  { sourcePath: "src/ui/CommandPanel.lua", className: "ModuleScript" },
  { sourcePath: "src/utils/ArtifactLoader.lua", className: "ModuleScript" },
  { sourcePath: "src/utils/ErrorReporter.lua", className: "ModuleScript" },
] as const;

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function asCdata(value: string): string {
  return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function withoutLuaExtension(segment: string): string {
  return segment.endsWith(".lua") ? segment.slice(0, -4) : segment;
}

function toInstanceSegments(sourcePath: string): string[] {
  return sourcePath.split("/").map(withoutLuaExtension);
}

function insertSource(
  root: InstanceNode,
  definition: PluginSourceDefinition,
  source: string,
): void {
  const segments = toInstanceSegments(definition.sourcePath);
  let parent = root;

  for (const segment of segments.slice(0, -1)) {
    let folder = parent.children.find(
      (child) => child.className === "Folder" && child.name === segment,
    );
    if (!folder) {
      folder = { name: segment, className: "Folder", children: [] };
      parent.children.push(folder);
    }
    parent = folder;
  }

  const name = segments.at(-1);
  if (!name) {
    throw new Error(`Invalid plugin source path: ${definition.sourcePath}`);
  }
  if (parent.children.some((child) => child.name === name)) {
    throw new Error(`Duplicate plugin instance path: ${definition.sourcePath}`);
  }

  parent.children.push({
    name,
    className: definition.className,
    source,
    children: [],
  });
}

function sortTree(node: InstanceNode): void {
  node.children.sort((left, right) => {
    const leftIsFolder = left.className === "Folder";
    const rightIsFolder = right.className === "Folder";
    if (leftIsFolder !== rightIsFolder) return leftIsFolder ? 1 : -1;
    return left.name.localeCompare(right.name);
  });
  node.children.forEach(sortTree);
}

function serializeInstanceTree(root: InstanceNode): string {
  let referent = 0;

  const serialize = (node: InstanceNode, depth: number): string => {
    const indent = "  ".repeat(depth);
    const childIndent = "  ".repeat(depth + 1);
    const propertyIndent = "  ".repeat(depth + 2);
    const currentReferent = `RBX${referent.toString().padStart(6, "0")}`;
    referent += 1;

    const properties: string[] = [];
    if (node.className === "Script") {
      properties.push(`${propertyIndent}<bool name="Disabled">false</bool>`);
    }
    if (node.source !== undefined) {
      properties.push(
        `${propertyIndent}<ProtectedString name="Source">${asCdata(node.source)}</ProtectedString>`,
      );
    }
    properties.push(
      `${propertyIndent}<string name="Name">${escapeXml(node.name)}</string>`,
    );

    const children = node.children.map((child) => serialize(child, depth + 1));

    return [
      `${indent}<Item class="${node.className}" referent="${currentReferent}">`,
      `${childIndent}<Properties>`,
      ...properties,
      `${childIndent}</Properties>`,
      ...children,
      `${indent}</Item>`,
    ].join("\n");
  };

  return serialize(root, 1);
}

function buildRbxmx(root: InstanceNode): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">',
    "  <External>null</External>",
    "  <External>nil</External>",
    serializeInstanceTree(root),
    "</roblox>",
    "",
  ].join("\n");
}

function readConfigVersion(configSource: string, field: string): string {
  const match = configSource.match(
    new RegExp(`Config\\.${field}\\s*=\\s*[\"']([^\"']+)[\"']`),
  );
  if (!match?.[1]) {
    throw new Error(`Unable to read Config.${field} from active plugin source`);
  }
  return match[1];
}

function instancePathFor(definition: PluginSourceDefinition): string {
  return [PLUGIN_NAME, ...toInstanceSegments(definition.sourcePath)].join(".");
}

function normalizeOutputPath(path: string): string {
  return path.split(sep).join("/");
}

export async function packageStudioPlugin(
  options: PackageOptions = {},
): Promise<StudioPluginPackageResult> {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const pluginRoot = resolve(repositoryRoot, PLUGIN_ROOT);
  const outputDirectory = resolve(
    options.outputDirectory ?? resolve(repositoryRoot, "dist/studio-plugin"),
  );

  const root: InstanceNode = {
    name: PLUGIN_NAME,
    className: "Model",
    children: [],
  };
  const packagedSources: PackagedPluginSource[] = [];
  let configSource = "";

  for (const definition of ACTIVE_PLUGIN_SOURCES) {
    const absoluteSourcePath = resolve(pluginRoot, definition.sourcePath);
    const relativePath = normalizeOutputPath(relative(pluginRoot, absoluteSourcePath));
    if (relativePath.startsWith("..")) {
      throw new Error(`Plugin source escapes canonical root: ${definition.sourcePath}`);
    }

    const source = await readFile(absoluteSourcePath, "utf8");
    if (definition.sourcePath === "src/core/Config.lua") {
      configSource = source;
    }
    insertSource(root, definition, source);
    packagedSources.push({
      ...definition,
      instancePath: instancePathFor(definition),
      sha256: sha256(source),
      sizeBytes: Buffer.byteLength(source, "utf8"),
    });
  }

  sortTree(root);
  packagedSources.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  );

  const pluginVersion = readConfigVersion(configSource, "PLUGIN_VERSION");
  const protocolVersion = readConfigVersion(configSource, "PROTOCOL_VERSION");
  const bundleFile = `${PLUGIN_NAME}-v${pluginVersion}.rbxmx`;
  const manifestFile = `${PLUGIN_NAME}-v${pluginVersion}.manifest.json`;
  const checksumsFile = `${PLUGIN_NAME}-v${pluginVersion}.SHA256SUMS.txt`;
  const bundle = buildRbxmx(root);
  const bundleSha256 = sha256(bundle);
  const manifest: StudioPluginPackageManifest = {
    formatVersion: 1,
    pluginName: PLUGIN_NAME,
    pluginVersion,
    protocolVersion,
    entrypoint: "plugin.lua",
    bundleFile,
    bundleSha256,
    bundleSizeBytes: Buffer.byteLength(bundle, "utf8"),
    sources: packagedSources,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const checksumsContent = [
    `${bundleSha256}  ${bundleFile}`,
    `${sha256(manifestContent)}  ${manifestFile}`,
    "",
  ].join("\n");

  const bundlePath = resolve(outputDirectory, bundleFile);
  const manifestPath = resolve(outputDirectory, manifestFile);
  const checksumsPath = resolve(outputDirectory, checksumsFile);
  await mkdir(dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, bundle, "utf8");
  await writeFile(manifestPath, manifestContent, "utf8");
  await writeFile(checksumsPath, checksumsContent, "utf8");

  return { bundlePath, manifestPath, checksumsPath, manifest };
}

async function main(): Promise<void> {
  const result = await packageStudioPlugin();
  console.log(`Studio plugin package created:`);
  console.log(`- ${relative(process.cwd(), result.bundlePath)}`);
  console.log(`- ${relative(process.cwd(), result.manifestPath)}`);
  console.log(`- ${relative(process.cwd(), result.checksumsPath)}`);
  console.log(`Bundle SHA-256: ${result.manifest.bundleSha256}`);
}

const currentModulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentModulePath) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
