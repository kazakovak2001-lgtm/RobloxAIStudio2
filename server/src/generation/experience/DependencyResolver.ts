/**
 * DependencyResolver — Resolves and validates artifact dependencies.
 */

import type { DependencyGraph, DependencyEdge } from "./ExperienceTypes";
import type { LuaArtifact } from "../lua";

export class DependencyResolver {
  /**
   * Build a complete dependency graph from artifacts.
   */
  resolve(artifacts: LuaArtifact[]): DependencyGraph {
    const nodes = artifacts.map((a) => a.name);
    const edges: DependencyEdge[] = [];
    const nameSet = new Set(nodes);

    for (const artifact of artifacts) {
      for (const dep of artifact.dependencies) {
        if (nameSet.has(dep)) {
          edges.push({
            from: artifact.name,
            to: dep,
            type: this.inferEdgeType(dep),
          });
        }
      }

      // Also scan content for require() calls
      const requires = this.extractRequires(artifact.content);
      for (const req of requires) {
        if (
          nameSet.has(req) &&
          !edges.some((e) => e.from === artifact.name && e.to === req)
        ) {
          edges.push({ from: artifact.name, to: req, type: "require" });
        }
      }
    }

    const initOrder = this.topologicalSort(nodes, edges);
    const circular = this.detectCircular(nodes, edges);

    return { nodes, edges, initOrder, circular };
  }

  private inferEdgeType(depName: string): DependencyEdge["type"] {
    if (depName.includes("Remote") || depName.includes("Remotes"))
      return "remote_event";
    if (depName.includes("Config") || depName.includes("Shared"))
      return "config";
    return "require";
  }

  private extractRequires(content: string): string[] {
    const matches =
      content.match(/require\([^)]*:WaitForChild\("([^"]+)"\)/g) ?? [];
    return matches
      .map((m) => {
        const match = m.match(/:WaitForChild\("([^"]+)"\)/);
        return match ? match[1] : "";
      })
      .filter(Boolean);
  }

  private topologicalSort(nodes: string[], edges: DependencyEdge[]): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node, 0);
      adjacency.set(node, []);
    }

    for (const edge of edges) {
      inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
      adjacency.get(edge.to)?.push(edge.from);
    }

    const queue = nodes.filter((n) => (inDegree.get(n) ?? 0) === 0);
    const sorted: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const dependent of adjacency.get(node) ?? []) {
        const newDegree = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) queue.push(dependent);
      }
    }

    // If not all nodes sorted, there's a cycle — append remaining
    for (const node of nodes) {
      if (!sorted.includes(node)) sorted.push(node);
    }

    return sorted;
  }

  private detectCircular(nodes: string[], edges: DependencyEdge[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) adjacency.set(node, []);
    for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);

    const dfs = (node: string, path: string[]) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      for (const neighbor of adjacency.get(node) ?? []) {
        if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart >= 0) {
            cycles.push(path.slice(cycleStart));
          }
        } else if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        }
      }

      recursionStack.delete(node);
    };

    for (const node of nodes) {
      if (!visited.has(node)) dfs(node, []);
    }

    return cycles;
  }
}
