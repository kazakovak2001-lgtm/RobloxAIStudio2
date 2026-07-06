/**
 * LuaRequireResolver.ts — Resolves ModuleScript dependencies and detects cycles.
 */

import type {
  ModuleDefinition,
  ScriptDefinition,
} from "../generation/engine/GenerationModel";

export interface RequireGraphNode {
  id: string;
  path: string;
  requires: string[];
}
export interface RequireResolution {
  valid: boolean;
  order: string[];
  cycles: string[][];
  errors: string[];
}

export class LuaRequireResolver {
  resolve(
    modules: ModuleDefinition[],
    scripts: ScriptDefinition[],
  ): RequireResolution {
    const nodes = new Map<string, RequireGraphNode>();
    const errors: string[] = [];

    for (const mod of modules) {
      nodes.set(mod.id, {
        id: mod.id,
        path: mod.path,
        requires: mod.dependencies.filter((d) =>
          modules.some((m) => m.id === d),
        ),
      });
    }
    for (const script of scripts) {
      nodes.set(script.id, {
        id: script.id,
        path: script.path,
        requires: script.dependencies.filter(
          (d) =>
            modules.some((m) => m.id === d) || scripts.some((s) => s.id === d),
        ),
      });
    }

    // Topological sort (Kahn's)
    const inDeg = new Map<string, number>();
    for (const [id] of nodes) inDeg.set(id, 0);
    for (const [, node] of nodes) {
      for (const req of node.requires) {
        if (inDeg.has(req)) inDeg.set(req, (inDeg.get(req) ?? 0) + 1);
      }
    }

    // Actually: inDeg counts how many times a node is depended ON
    // Reset and compute correctly: for each node, its dependencies add to ITS inDeg
    inDeg.clear();
    for (const [id] of nodes) inDeg.set(id, 0);
    for (const [, node] of nodes) {
      for (const _req of node.requires) {
        inDeg.set(node.id, (inDeg.get(node.id) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDeg) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const [id, node] of nodes) {
        if (node.requires.includes(current)) {
          inDeg.set(id, (inDeg.get(id) ?? 0) - 1);
          if (inDeg.get(id) === 0) queue.push(id);
        }
      }
    }

    // Detect cycles
    const cycles: string[][] = [];
    if (sorted.length < nodes.size) {
      const remaining = [...nodes.keys()].filter((id) => !sorted.includes(id));
      if (remaining.length > 0) {
        cycles.push(remaining);
        errors.push(`Circular require dependency: ${remaining.join(" → ")}`);
      }
    }

    return { valid: cycles.length === 0, order: sorted, cycles, errors };
  }
}
