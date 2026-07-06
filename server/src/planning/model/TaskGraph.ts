/**
 * TaskGraph.ts
 *
 * Directed Acyclic Graph model for execution planning.
 * Each node is an agent task; edges represent dependencies.
 */

export type TaskStatus =
  "pending" | "ready" | "running" | "done" | "failed" | "skipped";

export interface TaskNode {
  id: string;
  agent: string;
  type: string;
  input: Record<string, unknown>;
  dependencies: string[];
  status: TaskStatus;
  priority: number;
  output?: Record<string, unknown>;
  evaluation?: { quality: number; passed: boolean };
  durationMs?: number;
  error?: string;
}

export class TaskGraph {
  readonly goal: string;
  private nodes = new Map<string, TaskNode>();

  constructor(goal: string) {
    this.goal = goal;
  }

  addNode(node: TaskNode): void {
    this.nodes.set(node.id, node);
  }

  getNode(id: string): TaskNode | null {
    return this.nodes.get(id) ?? null;
  }

  getAllNodes(): TaskNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get nodes whose dependencies are all satisfied (done or skipped).
   */
  getReadyNodes(): TaskNode[] {
    const ready: TaskNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.status !== "pending") continue;
      const depsSatisfied = node.dependencies.every((depId) => {
        const dep = this.nodes.get(depId);
        return dep && (dep.status === "done" || dep.status === "skipped");
      });
      if (depsSatisfied) ready.push(node);
    }
    return ready.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Mark a node as running.
   */
  markRunning(id: string): void {
    const node = this.nodes.get(id);
    if (node) node.status = "running";
  }

  /**
   * Mark a node as done with its output.
   */
  markDone(
    id: string,
    output: Record<string, unknown>,
    durationMs: number,
    evaluation?: TaskNode["evaluation"],
  ): void {
    const node = this.nodes.get(id);
    if (node) {
      node.status = "done";
      node.output = output;
      node.durationMs = durationMs;
      node.evaluation = evaluation;
    }
  }

  /**
   * Mark a node as failed.
   */
  markFailed(id: string, error: string, durationMs: number): void {
    const node = this.nodes.get(id);
    if (node) {
      node.status = "failed";
      node.error = error;
      node.durationMs = durationMs;
    }
  }

  /**
   * Check if the plan is complete (all nodes done or skipped).
   */
  isComplete(): boolean {
    return Array.from(this.nodes.values()).every(
      (n) =>
        n.status === "done" || n.status === "skipped" || n.status === "failed",
    );
  }

  /**
   * Check if the plan has any failures.
   */
  hasFailed(): boolean {
    return Array.from(this.nodes.values()).some((n) => n.status === "failed");
  }

  /**
   * Get accumulated outputs from all completed nodes.
   */
  getAccumulatedOutputs(): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    for (const node of this.nodes.values()) {
      if (node.status === "done" && node.output) {
        Object.assign(outputs, node.output);
        outputs[node.id] = node.output;
      }
    }
    return outputs;
  }

  /**
   * Validate DAG integrity (no cycles).
   */
  validateDAG(): { valid: boolean; cycles: string[] } {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const cycles: string[] = [];

    const dfs = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) {
        cycles.push(nodeId);
        return true;
      }
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      inStack.add(nodeId);
      const node = this.nodes.get(nodeId);
      if (node) {
        for (const dep of node.dependencies) {
          if (dfs(dep)) return true;
        }
      }
      inStack.delete(nodeId);
      return false;
    };

    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) dfs(id);
    }

    return { valid: cycles.length === 0, cycles };
  }

  get size(): number {
    return this.nodes.size;
  }

  getStats() {
    const nodes = this.getAllNodes();
    return {
      total: nodes.length,
      pending: nodes.filter((n) => n.status === "pending").length,
      running: nodes.filter((n) => n.status === "running").length,
      done: nodes.filter((n) => n.status === "done").length,
      failed: nodes.filter((n) => n.status === "failed").length,
    };
  }
}
