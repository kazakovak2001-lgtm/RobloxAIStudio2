/**
 * CollaborationGraphEngine.ts
 *
 * Represents agent collaboration as a structured graph.
 * Tracks dependencies, detects conflicts, optimizes flow.
 */

import type {
  AgentTask,
  AgentResult,
  Conflict,
  CollaborationGraph,
  CollaborationNode,
  CollaborationEdge,
} from "./CollaborationTypes";

export class CollaborationGraphEngine {
  /**
   * Build a collaboration graph from a set of tasks and results.
   */
  buildGraph(
    tasks: AgentTask[],
    results: AgentResult[] = [],
  ): CollaborationGraph {
    const nodes: CollaborationNode[] = [];
    const edges: CollaborationEdge[] = [];

    // Add agent nodes
    const agentIds = new Set<string>();
    for (const task of tasks) {
      if (task.assignedTo) agentIds.add(task.assignedTo);
    }
    for (const agentId of agentIds) {
      nodes.push({ id: agentId, type: "agent", label: agentId });
    }

    // Add task nodes + edges
    for (const task of tasks) {
      nodes.push({
        id: task.taskId,
        type: "task",
        label: `${task.type} (${task.role})`,
      });

      if (task.assignedTo) {
        edges.push({
          from: task.assignedTo,
          to: task.taskId,
          relationship: "produces",
        });
      }

      for (const dep of task.dependencies) {
        edges.push({ from: dep, to: task.taskId, relationship: "depends_on" });
      }
    }

    // Add decision nodes from results
    for (const result of results) {
      for (const decision of result.decisions) {
        nodes.push({
          id: decision.decisionId,
          type: "decision",
          label: decision.summary,
        });
        edges.push({
          from: result.agentId,
          to: decision.decisionId,
          relationship: "produces",
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Detect conflicts between agent results.
   * Conflicts occur when multiple agents produce contradictory outputs for the same field.
   */
  detectConflicts(results: AgentResult[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const fieldMap = new Map<
      string,
      Array<{ agentId: string; value: unknown }>
    >();

    // Collect all output fields by key
    for (const result of results) {
      if (!result.success) continue;
      for (const [key, value] of Object.entries(result.output)) {
        const existing = fieldMap.get(key) ?? [];
        existing.push({ agentId: result.agentId, value });
        fieldMap.set(key, existing);
      }
    }

    // Detect contradictions (same field, different values from different agents)
    for (const [field, entries] of fieldMap) {
      if (entries.length < 2) continue;

      const uniqueValues = new Set(entries.map((e) => JSON.stringify(e.value)));
      if (uniqueValues.size > 1) {
        const values: Record<string, unknown> = {};
        for (const entry of entries) {
          values[entry.agentId] = entry.value;
        }

        conflicts.push({
          conflictId: `conflict-${field}-${Date.now()}`,
          agents: entries.map((e) => e.agentId),
          field,
          values,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflicts using deterministic rules.
   * Priority: orchestrator > architect > designer > validator > optimizer
   */
  resolveConflicts(conflicts: Conflict[]): Conflict[] {
    const rolePriority: Record<string, number> = {
      orchestrator: 1,
      architect: 2,
      designer: 3,
      validator: 4,
      optimizer: 5,
    };

    for (const conflict of conflicts) {
      if (conflict.resolved) continue;

      // Select winner by role priority (lower = wins)
      const agents = conflict.agents.sort((a, b) => {
        const roleA = a.split("-")[0] ?? "optimizer";
        const roleB = b.split("-")[0] ?? "optimizer";
        return (rolePriority[roleA] ?? 99) - (rolePriority[roleB] ?? 99);
      });

      const winner = agents[0];
      conflict.resolution = conflict.values[winner];
      conflict.resolved = true;
    }

    return conflicts;
  }

  /**
   * Detect cycles in the dependency graph (would cause deadlock).
   */
  detectCycles(graph: CollaborationGraph): string[][] {
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (edge.relationship === "depends_on") {
        const existing = adjacency.get(edge.to) ?? [];
        existing.push(edge.from);
        adjacency.set(edge.to, existing);
      }
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      if (inStack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart >= 0) cycles.push(path.slice(cycleStart));
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      inStack.add(node);
      path.push(node);
      for (const neighbor of adjacency.get(node) ?? []) {
        dfs(neighbor);
      }
      path.pop();
      inStack.delete(node);
    };

    for (const nodeId of adjacency.keys()) {
      if (!visited.has(nodeId)) dfs(nodeId);
    }

    return cycles;
  }
}
