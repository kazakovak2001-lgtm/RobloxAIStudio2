import type {
  ProjectAssembly,
  AssemblyValidationResult,
  AssemblyManifest,
} from "./AssemblyTypes";

/**
 * Semantic version format: MAJOR.MINOR.BUILD
 *  - BUILD increments per assembly rebuild
 *  - MINOR increments when blueprint (generationId) changes
 *  - MAJOR increments when schemaVersion changes
 */
export interface AssemblyVersion {
  major: number;
  minor: number;
  build: number;
}

export interface VersionDiff {
  changedSections: string[];
  addedScripts: number;
  removedScripts: number;
  addedFolders: number;
  removedFolders: number;
  scoreChange: number;
}

export interface VersionEntry {
  assemblyId: string;
  version: string;
  timestamp: Date;
  status: ProjectAssembly["status"];
  snapshot: ProjectAssembly;
  validation?: AssemblyValidationResult;
  manifest?: AssemblyManifest;
  diff?: VersionDiff;
}

export function parseVersion(v: string): AssemblyVersion {
  const [major, minor, build] = v.split(".").map(Number);
  return { major: major ?? 1, minor: minor ?? 0, build: build ?? 0 };
}

export function formatVersion(v: AssemblyVersion): string {
  return `${v.major}.${v.minor}.${v.build}`;
}

/**
 * Compute the next version based on the previous version and change context.
 */
export function nextVersion(
  previous: string | null,
  schemaChanged: boolean,
  generationChanged: boolean,
): string {
  if (!previous) return "1.0.1";
  const v = parseVersion(previous);
  if (schemaChanged)
    return formatVersion({ major: v.major + 1, minor: 0, build: 1 });
  if (generationChanged)
    return formatVersion({ major: v.major, minor: v.minor + 1, build: 1 });
  return formatVersion({ major: v.major, minor: v.minor, build: v.build + 1 });
}

/**
 * Compute a lightweight diff between two assemblies.
 */
export function computeVersionDiff(
  prev: ProjectAssembly,
  curr: ProjectAssembly,
): VersionDiff {
  const prevScriptIds = new Set(
    [...prev.scripts, ...prev.modules, ...prev.ui].map((s) => s.id),
  );
  const currScriptIds = new Set(
    [...curr.scripts, ...curr.modules, ...curr.ui].map((s) => s.id),
  );

  let addedScripts = 0;
  let removedScripts = 0;
  for (const id of currScriptIds) if (!prevScriptIds.has(id)) addedScripts++;
  for (const id of prevScriptIds) if (!currScriptIds.has(id)) removedScripts++;

  const prevFolderPaths = new Set(prev.folders.map((f) => f.path));
  const currFolderPaths = new Set(curr.folders.map((f) => f.path));
  let addedFolders = 0;
  let removedFolders = 0;
  for (const p of currFolderPaths) if (!prevFolderPaths.has(p)) addedFolders++;
  for (const p of prevFolderPaths)
    if (!currFolderPaths.has(p)) removedFolders++;

  const changedSections: string[] = [];
  if (addedScripts > 0 || removedScripts > 0) changedSections.push("scripts");
  if (addedFolders > 0 || removedFolders > 0) changedSections.push("folders");
  if (curr.world.length !== prev.world.length) changedSections.push("world");
  if (curr.network.length !== prev.network.length)
    changedSections.push("network");
  if (curr.assets.length !== prev.assets.length) changedSections.push("assets");

  const scoreChange =
    (curr.validation?.score ?? 0) - (prev.validation?.score ?? 0);

  return {
    changedSections,
    addedScripts,
    removedScripts,
    addedFolders,
    removedFolders,
    scoreChange,
  };
}
