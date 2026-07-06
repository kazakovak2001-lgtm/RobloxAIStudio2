/**
 * SceneGraphTranslator.ts
 *
 * Transforms Roblox Studio scene hierarchy into compiler workspace model.
 * Supports incremental updates and bidirectional translation.
 */

import type {
  RobloxInstance,
  RobloxWorkspace,
  SceneGraph,
  SceneGraphNode,
  SceneDiff,
  SerializedScene,
} from "./StudioTypes";
import type { WorkspaceEntry } from "../assembly/AssemblyTypes";

const INSTANCE_TYPE_MAP: Record<string, WorkspaceEntry["type"]> = {
  Folder: "Folder",
  Model: "Model",
  SpawnLocation: "SpawnLocation",
  Terrain: "Terrain",
  Part: "Model",
  MeshPart: "Model",
};

export class SceneGraphTranslator {
  private currentGraph: SceneGraph | null = null;

  /**
   * Build a full scene graph from a Roblox workspace.
   */
  buildSceneGraph(workspace: RobloxWorkspace): SceneGraph {
    const nodes = new Map<string, SceneGraphNode>();
    const edges: Array<{ parent: string; child: string }> = [];

    const buildNode = (instanceId: string, depth: number): void => {
      const instance = workspace.instances.get(instanceId);
      if (!instance) return;

      nodes.set(instanceId, {
        id: instanceId,
        className: instance.className,
        name: instance.name,
        properties: instance.properties,
        depth,
      });

      for (const childId of instance.children) {
        edges.push({ parent: instanceId, child: childId });
        buildNode(childId, depth + 1);
      }
    };

    buildNode(workspace.rootId, 0);

    this.currentGraph = { rootId: workspace.rootId, nodes, edges };
    return this.currentGraph;
  }

  /**
   * Apply an incremental diff to the current scene graph.
   */
  updateSceneGraph(diff: SceneDiff): SceneGraph {
    if (!this.currentGraph) {
      throw new Error("No scene graph exists — call buildSceneGraph first");
    }

    // Add new nodes
    for (const node of diff.added) {
      this.currentGraph.nodes.set(node.id, node);
    }

    // Remove nodes
    for (const id of diff.removed) {
      this.currentGraph.nodes.delete(id);
      this.currentGraph.edges = this.currentGraph.edges.filter(
        (e) => e.parent !== id && e.child !== id,
      );
    }

    // Modify nodes
    for (const mod of diff.modified) {
      const existing = this.currentGraph.nodes.get(mod.id);
      if (existing) {
        existing.properties = { ...existing.properties, ...mod.changes };
      }
    }

    // Move nodes
    for (const move of diff.moved) {
      this.currentGraph.edges = this.currentGraph.edges.filter(
        (e) => e.child !== move.id,
      );
      this.currentGraph.edges.push({ parent: move.newParent, child: move.id });
    }

    return this.currentGraph;
  }

  /**
   * Serialize the current graph for storage/transmission.
   */
  serializeGraph(): SerializedScene {
    if (!this.currentGraph) {
      return { version: "1.0", rootId: "", nodes: [], timestamp: new Date() };
    }

    const parentMap = new Map<string, string>();
    for (const edge of this.currentGraph.edges) {
      parentMap.set(edge.child, edge.parent);
    }

    const nodes = Array.from(this.currentGraph.nodes.values()).map((node) => ({
      ...node,
      parentId: parentMap.get(node.id),
    }));

    return {
      version: "1.0",
      rootId: this.currentGraph.rootId,
      nodes,
      timestamp: new Date(),
    };
  }

  /**
   * Convert scene graph nodes to compiler WorkspaceEntry objects.
   */
  toWorkspaceEntries(): WorkspaceEntry[] {
    if (!this.currentGraph) return [];

    const entries: WorkspaceEntry[] = [];
    const parentMap = new Map<string, string>();
    for (const edge of this.currentGraph.edges) {
      parentMap.set(edge.child, edge.parent);
    }

    for (const node of this.currentGraph.nodes.values()) {
      const parentPath = this.buildPath(node.id, parentMap);
      const entryType = INSTANCE_TYPE_MAP[node.className] ?? "Model";

      entries.push({
        id: node.id,
        name: node.name,
        type: entryType,
        path: parentPath,
        properties: node.properties,
      });
    }

    return entries;
  }

  getCurrentGraph(): SceneGraph | null {
    return this.currentGraph;
  }

  private buildPath(nodeId: string, parentMap: Map<string, string>): string {
    const parts: string[] = [];
    let current: string | undefined = nodeId;
    let depth = 0;

    while (current && depth < 20) {
      const node = this.currentGraph?.nodes.get(current);
      if (node) parts.unshift(node.name);
      current = parentMap.get(current);
      depth++;
    }

    return parts.join("/");
  }
}
