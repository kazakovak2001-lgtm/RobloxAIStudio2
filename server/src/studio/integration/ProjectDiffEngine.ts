/**
 * ProjectDiffEngine.ts
 *
 * Compares current project state with a new package to produce an incremental diff.
 */

import type { GenerationPackage } from "../../generation/coordinator/types";
import type { ProjectDiff, SyncItem } from "./types";

export class ProjectDiffEngine {
  /**
   * Compute diff between previous sync state and new package.
   */
  computeDiff(
    previous: Map<string, string> | null,
    current: GenerationPackage,
  ): ProjectDiff {
    const added: SyncItem[] = [];
    const modified: SyncItem[] = [];
    const removed: SyncItem[] = [];
    let unchanged = 0;

    // Build current items map
    const currentItems = new Map<
      string,
      { type: SyncItem["type"]; content: unknown; size: number }
    >();
    for (const script of current.scripts) {
      currentItems.set(script.path, {
        type: "script",
        content: script.content,
        size: script.size,
      });
    }
    for (const config of current.configs) {
      currentItems.set(config.path, {
        type: "config",
        content: config.content,
        size: config.size,
      });
    }
    // Metadata
    currentItems.set("manifest.json", {
      type: "metadata",
      content: current.metadata,
      size: JSON.stringify(current.metadata).length * 2,
    });

    if (!previous) {
      // First sync: everything is "add"
      for (const [path, item] of currentItems) {
        added.push({
          path,
          type: item.type,
          action: "add",
          content: item.content,
          size: item.size,
        });
      }
    } else {
      // Incremental: compare hashes
      for (const [path, item] of currentItems) {
        const prevHash = previous.get(path);
        const currentHash = this.hash(item.content);
        if (!prevHash) {
          added.push({
            path,
            type: item.type,
            action: "add",
            content: item.content,
            size: item.size,
          });
        } else if (prevHash !== currentHash) {
          modified.push({
            path,
            type: item.type,
            action: "modify",
            content: item.content,
            size: item.size,
          });
        } else {
          unchanged++;
        }
      }

      // Detect removals
      for (const [path] of previous) {
        if (!currentItems.has(path)) {
          removed.push({ path, type: "script", action: "remove", size: 0 });
        }
      }
    }

    return {
      added,
      modified,
      removed,
      unchanged,
      totalChanges: added.length + modified.length + removed.length,
    };
  }

  /**
   * Build a hash map from a package (for future diffing).
   */
  buildHashMap(pkg: GenerationPackage): Map<string, string> {
    const map = new Map<string, string>();
    for (const s of pkg.scripts) map.set(s.path, this.hash(s.content));
    for (const c of pkg.configs) map.set(c.path, this.hash(c.content));
    map.set("manifest.json", this.hash(pkg.metadata));
    return map;
  }

  private hash(content: unknown): string {
    const str = typeof content === "string" ? content : JSON.stringify(content);
    // Simple hash for comparison (not crypto-secure)
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return h.toString(36);
  }
}
