import type { ProjectAssembly } from "./AssemblyTypes";

/**
 * DiffNode — represents any structural entity change.
 */
export interface DiffNode {
  type: "script" | "folder" | "workspace" | "network" | "asset" | "config";
  path: string;
  name: string;
  before?: unknown;
  after?: unknown;
}

/**
 * AssemblyDiff — structural difference between two assembly versions.
 */
export interface AssemblyDiff {
  assemblyId: string;
  fromVersion: string;
  toVersion: string;
  changes: {
    added: DiffNode[];
    removed: DiffNode[];
    modified: DiffNode[];
    moved: DiffNode[];
  };
  summary: {
    totalChanges: number;
    scriptsChanged: number;
    worldChanges: number;
    networkChanges: number;
    assetChanges: number;
    foldersChanged: number;
    configChanges: number;
  };
}

/**
 * AssemblyDiffEngine
 *
 * Computes structural differences between two ProjectAssembly versions.
 * Pure, stateless, deterministic.
 */
export class AssemblyDiffEngine {
  /**
   * Compute the full structural diff between base and target assembly.
   */
  diffAssemblies(
    base: ProjectAssembly,
    target: ProjectAssembly,
    fromVersion: string,
    toVersion: string,
  ): AssemblyDiff {
    const added: DiffNode[] = [];
    const removed: DiffNode[] = [];
    const modified: DiffNode[] = [];
    const moved: DiffNode[] = [];

    // ── Scripts ───────────────────────────────────────────────────────────
    const allBaseScripts = [...base.scripts, ...base.modules, ...base.ui];
    const allTargetScripts = [
      ...target.scripts,
      ...target.modules,
      ...target.ui,
    ];
    this.diffByPath(
      allBaseScripts,
      allTargetScripts,
      "script",
      added,
      removed,
      modified,
      moved,
    );

    // ── Folders ───────────────────────────────────────────────────────────
    this.diffByPath(
      base.folders,
      target.folders,
      "folder",
      added,
      removed,
      modified,
      moved,
    );

    // ── Workspace entries ─────────────────────────────────────────────────
    this.diffByPath(
      base.world,
      target.world,
      "workspace",
      added,
      removed,
      modified,
      moved,
    );

    // ── Network objects ───────────────────────────────────────────────────
    this.diffByPath(
      base.network,
      target.network,
      "network",
      added,
      removed,
      modified,
      moved,
    );

    // ── Asset placeholders ────────────────────────────────────────────────
    this.diffByPath(
      base.assets,
      target.assets,
      "asset",
      added,
      removed,
      modified,
      moved,
    );

    // ── Configuration ─────────────────────────────────────────────────────
    this.diffConfigs(
      base.configuration,
      target.configuration,
      added,
      removed,
      modified,
    );

    const scriptsChanged = [...added, ...removed, ...modified, ...moved].filter(
      (n) => n.type === "script",
    ).length;
    const worldChanges = [...added, ...removed, ...modified].filter(
      (n) => n.type === "workspace",
    ).length;
    const networkChanges = [...added, ...removed, ...modified].filter(
      (n) => n.type === "network",
    ).length;
    const assetChanges = [...added, ...removed, ...modified].filter(
      (n) => n.type === "asset",
    ).length;
    const foldersChanged = [...added, ...removed, ...modified].filter(
      (n) => n.type === "folder",
    ).length;
    const configChanges = [...added, ...removed, ...modified].filter(
      (n) => n.type === "config",
    ).length;

    return {
      assemblyId: target.id,
      fromVersion,
      toVersion,
      changes: { added, removed, modified, moved },
      summary: {
        totalChanges:
          added.length + removed.length + modified.length + moved.length,
        scriptsChanged,
        worldChanges,
        networkChanges,
        assetChanges,
        foldersChanged,
        configChanges,
      },
    };
  }

  private diffByPath(
    baseItems: Array<{ path: string; name?: string; [k: string]: unknown }>,
    targetItems: Array<{ path: string; name?: string; [k: string]: unknown }>,
    type: DiffNode["type"],
    added: DiffNode[],
    removed: DiffNode[],
    modified: DiffNode[],
    moved: DiffNode[],
  ): void {
    const baseMap = new Map(baseItems.map((i) => [i.path, i]));
    const targetMap = new Map(targetItems.map((i) => [i.path, i]));

    // Added
    for (const [path, item] of targetMap) {
      if (!baseMap.has(path)) {
        // Check if it was moved (same name, different path)
        const baseByName = baseItems.find(
          (b) => b.name === item.name && b.path !== path,
        );
        if (baseByName) {
          moved.push({
            type,
            path,
            name: String(item.name ?? path),
            before: baseByName.path,
            after: path,
          });
        } else {
          added.push({
            type,
            path,
            name: String(item.name ?? path),
            after: item,
          });
        }
      }
    }

    // Removed
    for (const [path, item] of baseMap) {
      if (!targetMap.has(path)) {
        const targetByName = targetItems.find(
          (t) => t.name === item.name && t.path !== path,
        );
        if (!targetByName) {
          removed.push({
            type,
            path,
            name: String(item.name ?? path),
            before: item,
          });
        }
      }
    }

    // Modified (same path, different content)
    for (const [path, baseItem] of baseMap) {
      const targetItem = targetMap.get(path);
      if (targetItem && this.hasChanged(baseItem, targetItem)) {
        modified.push({
          type,
          path,
          name: String(baseItem.name ?? path),
          before: baseItem,
          after: targetItem,
        });
      }
    }
  }

  private diffConfigs(
    base: Array<{ key: string; value: unknown; [k: string]: unknown }>,
    target: Array<{ key: string; value: unknown; [k: string]: unknown }>,
    added: DiffNode[],
    removed: DiffNode[],
    modified: DiffNode[],
  ): void {
    const baseMap = new Map(base.map((c) => [c.key, c]));
    const targetMap = new Map(target.map((c) => [c.key, c]));

    for (const [key, item] of targetMap) {
      if (!baseMap.has(key)) {
        added.push({ type: "config", path: key, name: key, after: item.value });
      }
    }
    for (const [key, item] of baseMap) {
      if (!targetMap.has(key)) {
        removed.push({
          type: "config",
          path: key,
          name: key,
          before: item.value,
        });
      }
    }
    for (const [key, baseItem] of baseMap) {
      const targetItem = targetMap.get(key);
      if (
        targetItem &&
        JSON.stringify(baseItem.value) !== JSON.stringify(targetItem.value)
      ) {
        modified.push({
          type: "config",
          path: key,
          name: key,
          before: baseItem.value,
          after: targetItem.value,
        });
      }
    }
  }

  private hasChanged(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): boolean {
    // Shallow comparison on serializable fields (excludes functions/dates)
    const aJson = JSON.stringify(a, this.replacer);
    const bJson = JSON.stringify(b, this.replacer);
    return aJson !== bJson;
  }

  private replacer(_key: string, value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Map) return Object.fromEntries(value);
    return value;
  }
}
