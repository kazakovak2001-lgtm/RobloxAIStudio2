/**
 * AgentCoordinator — Orchestrates multi-agent collaboration for a project.
 */

import type {
  AgentRole,
  AgentTask,
  AgentResult,
  AgentMetrics,
  AgentContext,
} from "./CollaborationTypes";
import { createTaskId } from "./CollaborationTypes";
import { AgentMessageBus } from "./AgentMessageBus";
import { ConsensusEngine } from "./ConsensusEngine";

export class AgentCoordinator {
  private messageBus: AgentMessageBus;
  private consensus: ConsensusEngine;
  private tasks: AgentTask[] = [];
  private results: AgentResult[] = [];
  private metrics: Map<string, AgentMetrics> = new Map();
  private activeAgents: Set<AgentRole> = new Set();

  constructor() {
    this.messageBus = new AgentMessageBus();
    this.consensus = new ConsensusEngine();
    this.initializeMetrics();
  }

  /**
   * Assign a task to an agent.
   */
  assignTask(
    role: AgentRole,
    title: string,
    description: string,
    priority = 3,
  ): AgentTask {
    const task: AgentTask = {
      id: createTaskId(),
      assignee: role,
      title,
      description,
      status: "assigned",
      priority,
      createdAt: Date.now(),
    };
    this.tasks.push(task);
    this.activeAgents.add(role);
    return task;
  }

  /**
   * Record task completion.
   */
  completeTask(taskId: string, result: AgentResult): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;

    task.status = "completed";
    task.completedAt = Date.now();
    task.output = result.output;
    this.results.push(result);
    this.activeAgents.delete(result.role);

    // Update metrics
    this.updateMetrics(result);
  }

  /**
   * Run a collaborative session — assign tasks to all relevant agents.
   */
  runCollaborativeSession(
    context: AgentContext,
    systems: string[],
  ): AgentTask[] {
    const tasks: AgentTask[] = [];

    // Map systems to agents
    const roleMap: Record<string, AgentRole> = {
      gameplay: "gameplay",
      economy: "economy",
      ui: "ui",
      quest: "quest",
      narrative: "narrative",
      combat: "gameplay",
      inventory: "economy",
      performance: "performance",
      security: "security",
    };

    for (const system of systems) {
      const role = roleMap[system] ?? "gameplay";
      const task = this.assignTask(
        role,
        `Design ${system} system`,
        `Create ${system} for ${context.projectId}`,
        2,
      );
      tasks.push(task);
    }

    // Always assign reviewer
    tasks.push(
      this.assignTask(
        "reviewer",
        "Review all proposals",
        "Validate consistency and resolve conflicts",
        5,
      ),
    );

    return tasks;
  }

  /**
   * Get all active agents.
   */
  getActiveAgents(): AgentRole[] {
    return [...this.activeAgents];
  }

  /**
   * Get task status.
   */
  getTasks(): AgentTask[] {
    return [...this.tasks];
  }

  /**
   * Get agent metrics.
   */
  getMetrics(): AgentMetrics[] {
    return [...this.metrics.values()];
  }

  /**
   * Get the message bus for direct access.
   */
  getMessageBus(): AgentMessageBus {
    return this.messageBus;
  }

  /**
   * Get the consensus engine.
   */
  getConsensus(): ConsensusEngine {
    return this.consensus;
  }

  /**
   * Get results from completed tasks.
   */
  getResults(): AgentResult[] {
    return [...this.results];
  }

  private updateMetrics(result: AgentResult): void {
    const m = this.metrics.get(result.agentId) ?? {
      agentId: result.agentId,
      role: result.role,
      successRate: 0,
      averageScore: 0,
      averageTokens: 0,
      averageCost: 0,
      repairCount: 0,
      tasksCompleted: 0,
    };

    m.tasksCompleted++;
    m.successRate = result.success
      ? (m.successRate * (m.tasksCompleted - 1) + 1) / m.tasksCompleted
      : (m.successRate * (m.tasksCompleted - 1)) / m.tasksCompleted;
    m.averageTokens = Math.round(
      (m.averageTokens * (m.tasksCompleted - 1) + result.tokens) /
        m.tasksCompleted,
    );
    m.averageCost =
      (m.averageCost * (m.tasksCompleted - 1) + result.cost) / m.tasksCompleted;

    this.metrics.set(result.agentId, m);
  }

  private initializeMetrics(): void {
    const roles: AgentRole[] = [
      "gameplay",
      "economy",
      "ui",
      "quest",
      "narrative",
      "performance",
      "security",
      "reviewer",
    ];
    for (const role of roles) {
      this.metrics.set(role, {
        agentId: role,
        role,
        successRate: 0,
        averageScore: 0,
        averageTokens: 0,
        averageCost: 0,
        repairCount: 0,
        tasksCompleted: 0,
      });
    }
  }
}
