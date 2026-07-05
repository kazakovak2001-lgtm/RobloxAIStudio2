import type { AssemblyDiff, DiffNode } from "./AssemblyDiffEngine";

/**
 * GraphNode — a node in the structural evolution graph.
 */
export interface GraphNode {
  id: string;
  type: DiffNode["type"];
  path: string;
  name: string;
  changeKind: "added" | "removed" | "modified" | "moved" | "unchanged";
  service?: string;
}

/**
 * GraphEdge — a directional relationship between two graph nodes.
 */
export interface GraphEdge {
  from: string;
  to: string;
  relationship: "depends_on" | "contains" | "moved_from" | "modifies";
}

/**
 * ChangeGraph — graph representation of structural evolution.
 */
export interface ChangeGraph {
  assemblyId: string;
  fromVersion: string;
  toVersion: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    addedNodes: number;
    removedNodes: number;
    modifiedNodes: number;
    movedNodes: number;
  };
}

/**
 * AssemblyChangeGraph
 *
 * Converts an AssemblyDiff into a graph representation.
 * Supports dependency tracking and change propagation visibility.
 */
export class AssemblyChangeGraphBuilder {
  /**
   * Build a change graph from a diff output.
   */
  buildChangeGraph(diff: AssemblyDiff): ChangeGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    let nodeCounter = 0;

    const makeId = () => `node-${++nodeCounter}`;

    // ── Added nodes ──────────────────────────────────────────────────────
    for (const n of diff.changes.added) {
      const id = makeId();
      nodes.push({
        id,
        type: n.type,
        path: n.path,
        name: n.name,
        changeKind: "added",
      });
      this.addContainmentEdge(nodes, edges, id, n.path);
    }

    // ── Removed nodes ────────────────────────────────────────────────────
    for (const n of diff.changes.removed) {
      const id = makeId();
      nodes.push({
        id,
        type: n.type,
        path: n.path,
        name: n.name,
        changeKind: "removed",
      });
    }

    // ── Modified nodes ───────────────────────────────────────────────────
    for (const n of diff.changes.modified) {
      const id = makeId();
      nodes.push({
        id,
        type: n.type,
        path: n.path,
        name: n.name,
        changeKind: "modified",
      });
      this.addContainmentEdge(nodes, edges, id, n.path);
    }

    // ── Moved nodes ──────────────────────────────────────────────────────
    for (const n of diff.changes.moved) {
      const id = makeId();
      nodes.push({
        id,
        type: n.type,
        path: n.path,
        name: n.name,
        changeKind: "moved",
      });
      if (typeof n.before === "string") {
        const sourceId = makeId();
        nodes.push({
          id: sourceId,
          type: n.type,
          path: n.before,
          name: n.name,
          changeKind: "moved",
        });
        edges.push({ from: sourceId, to: id, relationship: "moved_from" });
      }
    }

    // ── Dependency edges (scripts depend on modules in same service) ─────
    const scriptNodes = nodes.filter(
      (n) => n.type === "script" && n.changeKind !== "removed",
    );
    const moduleNodes = nodes.filter(
      (n) => n.type === "script" && n.path.includes("Shared"),
    );
    for (const script of scriptNodes) {
      for (const mod of moduleNodes) {
        if (script.id !== mod.id) {
          edges.push({
            from: script.id,
            to: mod.id,
            relationship: "depends_on",
          });
        }
      }
    }

    return {
      assemblyId: diff.assemblyId,
      fromVersion: diff.fromVersion,
      toVersion: diff.toVersion,
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        addedNodes: diff.changes.added.length,
        removedNodes: diff.changes.removed.length,
        modifiedNodes: diff.changes.modified.length,
        movedNodes: diff.changes.moved.length,
      },
    };
  }

  private addContainmentEdge(
    nodes: GraphNode[],
    edges: GraphEdge[],
    childId: string,
    childPath: string,
  ): void {
    // Find a parent folder node by path prefix
    const parentPath = childPath.split("/").slice(0, -1).join("/");
    if (!parentPath) return;
    const parent = nodes.find(
      (n) => n.path === parentPath && n.type === "folder",
    );
    if (parent) {
      edges.push({ from: parent.id, to: childId, relationship: "contains" });
    }
  }
}
