/**
 * PlannerEngine.ts
 *
 * High-level goal decomposition engine.
 * Converts user intent into a structured execution plan (DAG).
 * Extends existing PlanningEngine (v0.8) with goal-driven planning.
 */

import { TaskGraph, type TaskNode } from "../model/TaskGraph";
import {
  GAME_GENERATION_PIPELINE,
  selectPipelineNodes,
  type PipelineDefinition,
  type PipelinePlanIssue,
} from "./pipelineDefinition";

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
  /** Pipeline definition this plan was built from. */
  definitionId: string;
  /** Version of that definition, recorded on the execution. */
  definitionVersion: number;
}

/**
 * A requested plan that cannot be executed.
 *
 * Carries the structured issues so a route can answer with what was wrong
 * instead of a generic failure. `issues` never contains request content
 * beyond the agent names the caller itself supplied.
 */
export class PlanValidationError extends Error {
  readonly issues: readonly PipelinePlanIssue[];

  constructor(issues: readonly PipelinePlanIssue[]) {
    super(
      `Plan is not executable: ${issues.map((issue) => issue.message).join("; ")}`,
    );
    this.name = "PlanValidationError";
    this.issues = issues;
  }
}

export class PlannerEngine {
  private planCounter = 0;
  private readonly definition: PipelineDefinition;

  constructor(definition: PipelineDefinition = GAME_GENERATION_PIPELINE) {
    this.definition = definition;
  }

  /**
   * Create a full execution plan from a high-level goal.
   *
   * Fails closed: a goal that selects a set of agents which cannot run as a
   * graph raises `PlanValidationError` rather than returning a plan whose
   * nodes could never become ready.
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
      definitionId: this.definition.id,
      definitionVersion: this.definition.version,
    };
  }

  /**
   * Decompose a goal into individual task nodes.
   *
   * `goal.requiredAgents` is a *request*, not an instruction. It may only
   * narrow the pipeline the server defines: a name outside the definition is
   * rejected instead of becoming an ad-hoc node, and a selection that drops a
   * dependency is rejected instead of producing an unreachable one.
   */
  decomposeGoal(goal: PlanGoal): TaskNode[] {
    const nodes: TaskNode[] = [];

    const { nodes: steps, issues } = selectPipelineNodes(
      this.definition,
      goal.requiredAgents,
    );
    if (issues.length > 0) {
      throw new PlanValidationError(issues);
    }

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
