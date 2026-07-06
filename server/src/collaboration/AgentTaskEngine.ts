/**
 * AgentTaskEngine.ts
 *
 * Transforms system events into structured AI tasks.
 * Decomposes complex builds into subtasks assigned by role.
 */

import type { SystemEvent } from "../eventsource/EventStore";
import type {
  AgentTask,
  AgentRole,
  TaskAssignment,
  TaskStatus,
  TaskPriority,
} from "./CollaborationTypes";
import { AIAgentRegistry, getAIAgentRegistry } from "./AIAgentRegistry";

export class AgentTaskEngine {
  private registry: AIAgentRegistry;
  private tasks = new Map<string, AgentTask>();
  private counter = 0;

  constructor(registry?: AIAgentRegistry) {
    this.registry = registry ?? getAIAgentRegistry();
  }

  /**
   * Create tasks from a batch of system events.
   */
  createTasksFromEvents(events: SystemEvent[], projectId: string): AgentTask[] {
    const tasks: AgentTask[] = [];

    for (const event of events) {
      const task = this.eventToTask(event, projectId);
      if (task) {
        this.tasks.set(task.taskId, task);
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Create a manual task.
   */
  createTask(
    projectId: string,
    type: string,
    role: AgentRole,
    payload: Record<string, unknown>,
    priority: TaskPriority = "medium",
    dependencies: string[] = [],
  ): AgentTask {
    this.counter++;
    const task: AgentTask = {
      taskId: `task-${Date.now()}-${this.counter}`,
      projectId,
      type,
      role,
      priority,
      payload,
      dependencies,
      createdAt: new Date(),
      status: "pending",
    };
    this.tasks.set(task.taskId, task);
    return task;
  }

  /**
   * Assign tasks to available agents based on role matching.
   */
  assignTasks(tasks: AgentTask[]): TaskAssignment[] {
    const assignments: TaskAssignment[] = [];

    for (const task of tasks) {
      const candidates = this.registry.listByRole(task.role);
      if (candidates.length === 0) continue;

      // Select first available agent for role (simple round-robin)
      const agent = candidates[0];
      task.assignedTo = agent.agentId;
      task.status = "assigned";

      assignments.push({
        taskId: task.taskId,
        agentId: agent.agentId,
        assignedAt: new Date(),
        reason: `Role match: ${task.role} → ${agent.name}`,
      });
    }

    return assignments;
  }

  /**
   * Track task status.
   */
  trackTask(taskId: string): TaskStatus | null {
    return this.tasks.get(taskId)?.status ?? null;
  }

  updateTaskStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (task) task.status = status;
  }

  getTask(taskId: string): AgentTask | null {
    return this.tasks.get(taskId) ?? null;
  }

  getPendingTasks(): AgentTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === "pending" || t.status === "assigned",
    );
  }

  private eventToTask(event: SystemEvent, projectId: string): AgentTask | null {
    switch (event.type) {
      case "job.enqueued":
        return this.createTask(
          projectId,
          "build-review",
          "architect",
          { jobId: event.metadata.jobId },
          "high",
        );
      case "assembly.stored":
        return this.createTask(
          projectId,
          "validate-assembly",
          "validator",
          { assemblyId: event.metadata.assemblyId },
          "medium",
        );
      case "governance.decision":
        if ((event.payload as any)?.status === "BLOCK") {
          return this.createTask(
            projectId,
            "resolve-block",
            "optimizer",
            { decision: event.payload },
            "critical",
          );
        }
        return null;
      default:
        return null;
    }
  }
}
