/**
 * AgentOrchestrator.ts
 *
 * Coordinates multi-agent execution over EventStore.
 * Distributes tasks, enforces execution order, resolves conflicts,
 * and ensures deterministic results.
 */

import type {
  AgentTask,
  AgentResult,
  AgentExecutionPlan,
  Conflict,
} from "./CollaborationTypes";
import { AIAgentRegistry, getAIAgentRegistry } from "./AIAgentRegistry";
import { AgentTaskEngine } from "./AgentTaskEngine";
import { AgentMemoryManager } from "./AgentMemoryManager";
import { CollaborationGraphEngine } from "./CollaborationGraphEngine";
import { AgentEventBridge } from "./AgentEventBridge";

export class AgentOrchestrator {
  private registry: AIAgentRegistry;
  private taskEngine: AgentTaskEngine;
  private memoryManager: AgentMemoryManager;
  private graphEngine: CollaborationGraphEngine;
  private eventBridge: AgentEventBridge;

  constructor(registry?: AIAgentRegistry, eventBridge?: AgentEventBridge) {
    this.registry = registry ?? getAIAgentRegistry();
    this.taskEngine = new AgentTaskEngine(this.registry);
    this.memoryManager = new AgentMemoryManager();
    this.graphEngine = new CollaborationGraphEngine();
    this.eventBridge = eventBridge ?? new AgentEventBridge();
  }

  /**
   * Dispatch tasks by creating an execution plan.
   */
  dispatch(tasks: AgentTask[]): AgentExecutionPlan {
    // Assign tasks to agents
    const assignments = this.taskEngine.assignTasks(tasks);

    // Determine execution order (topological sort by dependencies)
    const order = this.topologicalSort(tasks);

    // Identify parallel groups (tasks with no mutual dependencies)
    const parallelGroups = this.identifyParallelGroups(tasks, order);

    const plan: AgentExecutionPlan = {
      planId: `ai-plan-${Date.now()}`,
      projectId: tasks[0]?.projectId ?? "",
      tasks,
      executionOrder: order,
      parallelGroups,
      createdAt: new Date(),
    };

    console.log(
      `[AI-ORCHESTRATOR] Plan created | Tasks: ${tasks.length} | Assignments: ${assignments.length} | Order: ${order.length}`,
    );

    return plan;
  }

  /**
   * Execute a plan sequentially (respecting dependency order).
   */
  async run(plan: AgentExecutionPlan): Promise<AgentResult[]> {
    const results: AgentResult[] = [];

    for (const taskId of plan.executionOrder) {
      const task = plan.tasks.find((t) => t.taskId === taskId);
      if (!task || !task.assignedTo) continue;

      const agent = this.registry.get(task.assignedTo);
      if (!agent) {
        results.push(this.failedResult(task, "Agent not found"));
        continue;
      }

      // Check dependencies completed
      const depsComplete = task.dependencies.every((depId) =>
        results.some((r) => r.taskId === depId && r.success),
      );
      if (!depsComplete) {
        results.push(this.failedResult(task, "Dependencies not satisfied"));
        continue;
      }

      // Execute
      this.taskEngine.updateTaskStatus(task.taskId, "running");
      const start = Date.now();

      try {
        const result = await agent.execute(task);
        result.durationMs = Date.now() - start;
        results.push(result);

        // Store result in agent memory
        this.memoryManager.write(
          agent.agentId,
          `task:${task.taskId}`,
          result.output,
        );

        // Emit decisions to EventStore
        for (const decision of result.decisions) {
          this.eventBridge.emitDecision(agent.agentId, decision);
        }

        this.taskEngine.updateTaskStatus(
          task.taskId,
          result.success ? "completed" : "failed",
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push(this.failedResult(task, errorMsg, Date.now() - start));
        this.taskEngine.updateTaskStatus(task.taskId, "failed");
      }
    }

    // Detect and resolve conflicts
    const conflicts = this.graphEngine.detectConflicts(results);
    if (conflicts.length > 0) {
      this.resolveConflicts(conflicts);
    }

    console.log(
      `[AI-ORCHESTRATOR] Execution complete | Results: ${results.length} | Conflicts: ${conflicts.length}`,
    );

    return results;
  }

  /**
   * Resolve conflicts between agent results.
   */
  resolveConflicts(conflicts: Conflict[]): Conflict[] {
    return this.graphEngine.resolveConflicts(conflicts);
  }

  /**
   * Get the memory manager for external access.
   */
  getMemoryManager(): AgentMemoryManager {
    return this.memoryManager;
  }

  getTaskEngine(): AgentTaskEngine {
    return this.taskEngine;
  }

  getGraphEngine(): CollaborationGraphEngine {
    return this.graphEngine;
  }

  private topologicalSort(tasks: AgentTask[]): string[] {
    const taskMap = new Map(tasks.map((t) => [t.taskId, t]));
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (taskId: string): void => {
      if (visited.has(taskId)) return;
      visited.add(taskId);
      const task = taskMap.get(taskId);
      if (!task) return;
      for (const dep of task.dependencies) {
        visit(dep);
      }
      order.push(taskId);
    };

    for (const task of tasks) {
      visit(task.taskId);
    }

    return order;
  }

  private identifyParallelGroups(
    tasks: AgentTask[],
    order: string[],
  ): string[][] {
    const groups: string[][] = [];
    const completed = new Set<string>();

    for (const taskId of order) {
      const task = tasks.find((t) => t.taskId === taskId);
      if (!task) continue;

      const allDepsMet = task.dependencies.every((d) => completed.has(d));
      if (allDepsMet) {
        // Find existing group at this "level"
        const lastGroup = groups[groups.length - 1];
        if (
          lastGroup &&
          lastGroup.every((id) => {
            const t = tasks.find((tt) => tt.taskId === id);
            return t && t.dependencies.every((d) => completed.has(d));
          })
        ) {
          lastGroup.push(taskId);
        } else {
          groups.push([taskId]);
        }
      }
      completed.add(taskId);
    }

    return groups.filter((g) => g.length > 1);
  }

  private failedResult(
    task: AgentTask,
    error: string,
    durationMs = 0,
  ): AgentResult {
    return {
      taskId: task.taskId,
      agentId: task.assignedTo ?? "unknown",
      success: false,
      output: {},
      decisions: [],
      durationMs,
      timestamp: new Date(),
      error,
    };
  }
}
