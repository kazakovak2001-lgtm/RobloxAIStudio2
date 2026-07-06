/**
 * PlannerEngine.ts
 *
 * High-level goal decomposition engine.
 * Converts user intent into a structured execution plan (DAG).
 * Extends existing PlanningEngine (v0.8) with goal-driven planning.
 */

import { TaskGraph, type TaskNode } from "../model/TaskGraph";

export interface PlanGoal {
  intent: string;
  constraints: string[];
  requiredAgents?: string[];
  projectId?: string;
  context?: Record<string, unknown>;
}

export interface DecomposedPlan {
  planId: string;
  goal: PlanGoal;
  graph: TaskGraph;
  createdAt: Date;
  estimatedSteps: number;
}

/** Default agent pipeline for game generation goals. */
const DEFAULT_DECOMPOSITION: Array<{
  agent: string;
  type: string;
  deps: string[];
}> = [
  { agent: "requirements", type: "analysis", deps: [] },
  { agent: "planner", type: "planning", deps: ["requirements"] },
  { agent: "game_designer", type: "design", deps: ["planner"] },
  { agent: "roblox_architect", type: "architecture", deps: ["game_designer"] },
  { agent: "lua_generator", type: "generation", deps: ["roblox_architect"] },
  { agent: "ui_generator", type: "generation", deps: ["game_designer"] },
  { agent: "asset_planner", type: "generation", deps: ["game_designer"] },
  {
    agent: "orchestrator",
    type: "synthesis",
    deps: ["lua_generator", "ui_generator", "asset_planner"],
  },
];

export class PlannerEngine {
  private planCounter = 0;

  /**
   * Create a full execution plan from a high-level goal.
   */
  createPlan(goal: PlanGoal): DecomposedPlan {
    this.planCounter++;
    const planId = `plan-${Date.now()}-${this.planCounter}`;

    // Decompose goal into tasks
    const tasks = this.decomposeGoal(goal);

    // Build execution graph (DAG)
    const graph = this.buildExecutionGraph(tasks, goal);

    console.log(
      `[PLANNER] Plan created | ID: ${planId} | Intent: ${goal.intent.slice(0, 60)} | Tasks: ${tasks.length}`,
    );

    return {
      planId,
      goal,
      graph,
      createdAt: new Date(),
      estimatedSteps: tasks.length,
    };
  }

  /**
   * Decompose a goal into individual task nodes.
   */
  decomposeGoal(goal: PlanGoal): TaskNode[] {
    const nodes: TaskNode[] = [];

    // Use required agents if specified, otherwise default pipeline
    const steps = goal.requiredAgents
      ? goal.requiredAgents.map((agent) => {
          const def = DEFAULT_DECOMPOSITION.find((d) => d.agent === agent);
          return def ?? { agent, type: "custom", deps: [] };
        })
      : DEFAULT_DECOMPOSITION;

    for (const step of steps) {
      nodes.push({
        id: `task-${step.agent}`,
        agent: step.agent,
        type: step.type,
        input: {
          goal: goal.intent,
          constraints: goal.constraints,
          context: goal.context,
        },
        dependencies: step.deps.map((d) => `task-${d}`),
        status: "pending",
        priority: nodes.length + 1,
      });
    }

    return nodes;
  }

  /**
   * Build the execution DAG from task nodes.
   */
  buildExecutionGraph(tasks: TaskNode[], goal: PlanGoal): TaskGraph {
    const graph = new TaskGraph(goal.intent);
    for (const task of tasks) {
      graph.addNode(task);
    }
    return graph;
  }
}
