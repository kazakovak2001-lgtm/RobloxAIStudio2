import type { ChangeGraph, GraphNode, GraphEdge } from "./AssemblyChangeGraph";

/**
 * DependencyMap — resolved transitive dependency chains.
 */
export interface DependencyMap {
  /** nodeId → set of all nodes it depends on (transitive) */
  upstream: Map<string, Set<string>>;
  /** nodeId → set of all nodes that depend on it (transitive) */
  downstream: Map<string, Set<string>>;
  /** Nodes that are root causes (no upstream dependencies) */
  roots: string[];
  /** Nodes involved in circular dependencies */
  circularRisks: string[];
  /** Maximum depth of dependency chain */
  maxDepth: number;
}

/**
 * DependencyResolver
 *
 * Traverses a ChangeGraph to compute transitive dependency chains.
 * Detects circular dependencies, identifies root cause nodes,
 * and computes downstream propagation.
 */
export class DependencyResolver {
  /**
   * Resolve all dependency relationships from a ChangeGraph.
   */
  resolveDependencies(graph: ChangeGraph): DependencyMap {
    const upstream = new Map<string, Set<string>>();
    const downstream = new Map<string, Set<string>>();

    // Initialize maps for all nodes
    for (const node of graph.nodes) {
      upstream.set(node.id, new Set());
      downstream.set(node.id, new Set());
    }

    // Build direct relationships from edges
    for (const edge of graph.edges) {
      if (
        edge.relationship === "depends_on" ||
        edge.relationship === "contains"
      ) {
        // from depends on to (or from contains to)
        upstream.get(edge.from)?.add(edge.to);
        downstream.get(edge.to)?.add(edge.from);
      }
    }

    // Compute transitive closure (upstream)
    for (const nodeId of upstream.keys()) {
      this.computeTransitive(nodeId, upstream, "upstream");
    }

    // Compute transitive closure (downstream)
    for (const nodeId of downstream.keys()) {
      this.computeTransitive(nodeId, downstream, "downstream");
    }

    // Identify roots (no upstream dependencies)
    const roots: string[] = [];
    for (const [nodeId, deps] of upstream) {
      if (deps.size === 0) roots.push(nodeId);
    }

    // Detect circular dependencies
    const circularRisks = this.detectCircular(graph);

    // Compute max depth
    const maxDepth = this.computeMaxDepth(graph, upstream);

    return { upstream, downstream, roots, circularRisks, maxDepth };
  }

  /**
   * Get all nodes affected downstream by a change to a specific node.
   */
  getAffectedDownstream(nodeId: string, depMap: DependencyMap): string[] {
    return Array.from(depMap.downstream.get(nodeId) ?? []);
  }

  /**
   * Compute propagation depth from a specific node.
   */
  getPropagationDepth(nodeId: string, depMap: DependencyMap): number {
    const visited = new Set<string>();
    let depth = 0;
    let current = new Set([nodeId]);

    while (current.size > 0) {
      const next = new Set<string>();
      for (const id of current) {
        if (visited.has(id)) continue;
        visited.add(id);
        const deps = depMap.downstream.get(id);
        if (deps) {
          for (const dep of deps) {
            if (!visited.has(dep)) next.add(dep);
          }
        }
      }
      if (next.size > 0) depth++;
      current = next;
    }

    return depth;
  }

  private computeTransitive(
    startNode: string,
    relations: Map<string, Set<string>>,
    _direction: string,
  ): void {
    const visited = new Set<string>();
    const stack = [startNode];
    const allTransitive = new Set<string>();

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const directDeps = relations.get(current);
      if (!directDeps) continue;

      for (const dep of directDeps) {
        if (dep !== startNode) {
          allTransitive.add(dep);
          if (!visited.has(dep)) stack.push(dep);
        }
      }
    }

    relations.set(startNode, allTransitive);
  }

  private detectCircular(graph: ChangeGraph): string[] {
    const circular: string[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const adjacency = new Map<string, string[]>();
    for (const node of graph.nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of graph.edges) {
      if (edge.relationship === "depends_on") {
        adjacency.get(edge.from)?.push(edge.to);
      }
    }

    const dfs = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (dfs(neighbor)) {
          circular.push(nodeId);
          return true;
        }
      }
      inStack.delete(nodeId);
      return false;
    };

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) dfs(node.id);
    }

    return [...new Set(circular)];
  }

  private computeMaxDepth(
    graph: ChangeGraph,
    upstream: Map<string, Set<string>>,
  ): number {
    let max = 0;
    for (const deps of upstream.values()) {
      if (deps.size > max) max = deps.size;
    }
    return max;
  }
}
