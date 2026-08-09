/**
 * pipelineDefinition.ts
 *
 * PIPELINE-1A. The generation pipeline as versioned, validated data.
 *
 * The pipeline used to be an unexported array literal inside `PlannerEngine`,
 * which made two things impossible: naming which pipeline shape produced a
 * given execution, and rejecting a plan that cannot run before it runs. Both
 * mattered, because `requiredAgents` is client-supplied on the plan routes.
 *
 * This module is pure: no I/O, no clock, no registry. Everything it needs to
 * judge a plan is either in the definition or passed in, so the same inputs
 * always produce the same verdict and it can be exercised directly in tests.
 */

import { getAgentDefinition } from "../../agents/contract/agentContract";

/** A single agent step in a pipeline definition. */
export interface PipelineNodeDefinition {
  /** Registered agent type that executes this node. */
  readonly agent: string;
  /** Coarse task category, used for tracing and evaluation. */
  readonly type: string;
  /** Agents whose output this node consumes. */
  readonly deps: readonly string[];
}

/** A named, versioned pipeline shape. */
export interface PipelineDefinition {
  /** Stable identifier, e.g. `game-generation`. */
  readonly id: string;
  /**
   * Incremented whenever the node set or its edges change.
   *
   * Recorded on the execution so an artifact set can be traced back to the
   * exact pipeline shape that produced it. Changing the nodes without
   * bumping this makes historical executions unattributable.
   */
  readonly version: number;
  readonly nodes: readonly PipelineNodeDefinition[];
}

/** Why a requested plan cannot be executed. */
export type PipelinePlanIssueCode =
  /** The definition, or the requested selection, has no nodes. */
  | "empty-pipeline"
  /** Two nodes claim the same agent, so their task ids would collide. */
  | "duplicate-agent"
  /** A node depends on an agent the definition does not contain. */
  | "unknown-dependency"
  /** The definition's edges form a cycle, so no node could ever start. */
  | "cycle"
  /** A requested agent is not part of this pipeline definition. */
  | "unknown-agent"
  /** A node names an agent with no authoritative definition. */
  | "undefined-agent"
  /** A node names an agent whose definition is not pipeline-reachable. */
  | "unreachable-agent"
  /** A selected node depends on a node the selection leaves out. */
  | "unsatisfied-dependency";

export interface PipelinePlanIssue {
  readonly code: PipelinePlanIssueCode;
  /** Agent the issue is about, when it is about one node. */
  readonly agent?: string;
  /** The dependency that could not be satisfied, when applicable. */
  readonly dependency?: string;
  /** Operator-readable explanation. Contains no request content. */
  readonly message: string;
}

/**
 * The canonical game-generation pipeline.
 *
 * Adding a stage here changes what every generation runs, so it is a
 * deliberate delivery with its own evidence — not an edit made in passing.
 * Bump `version` in the same change.
 */
export const GAME_GENERATION_PIPELINE: PipelineDefinition = {
  id: "game-generation",
  version: 1,
  nodes: [
    { agent: "requirements", type: "analysis", deps: [] },
    { agent: "planner", type: "planning", deps: ["requirements"] },
    { agent: "game_designer", type: "design", deps: ["planner"] },
    {
      agent: "roblox_architect",
      type: "architecture",
      deps: ["game_designer"],
    },
    { agent: "lua_generator", type: "generation", deps: ["roblox_architect"] },
    { agent: "ui_generator", type: "generation", deps: ["game_designer"] },
    { agent: "asset_planner", type: "generation", deps: ["game_designer"] },
    {
      agent: "orchestrator",
      type: "synthesis",
      deps: ["lua_generator", "ui_generator", "asset_planner"],
    },
  ],
};

/**
 * Check a definition's own integrity, independent of any request.
 *
 * A definition that fails this can never produce a runnable plan, so this is
 * asserted in tests rather than only at request time.
 */
export function validatePipelineDefinition(
  definition: PipelineDefinition,
): PipelinePlanIssue[] {
  const issues: PipelinePlanIssue[] = [];

  if (definition.nodes.length === 0) {
    issues.push({
      code: "empty-pipeline",
      message: `Pipeline "${definition.id}" defines no nodes`,
    });
    return issues;
  }

  const seen = new Set<string>();
  for (const node of definition.nodes) {
    if (seen.has(node.agent)) {
      issues.push({
        code: "duplicate-agent",
        agent: node.agent,
        message: `Pipeline "${definition.id}" defines agent "${node.agent}" more than once`,
      });
    }
    seen.add(node.agent);
  }

  // AGENT-CONTRACT-1. A node must name an agent that has an authoritative
  // definition, and one the pipeline is allowed to run. A string that happens
  // to match a registry key is not a contract: without a definition nothing
  // states what the node produces or whether it may fall back.
  for (const node of definition.nodes) {
    const agent = getAgentDefinition(node.agent);
    if (!agent) {
      issues.push({
        code: "undefined-agent",
        agent: node.agent,
        message: `Agent "${node.agent}" has no authoritative definition`,
      });
      continue;
    }
    if (agent.reachability !== "pipeline") {
      issues.push({
        code: "unreachable-agent",
        agent: node.agent,
        message: `Agent "${node.agent}" is defined as ${agent.reachability} and must not appear in a pipeline`,
      });
    }
  }

  for (const node of definition.nodes) {
    for (const dependency of node.deps) {
      if (!seen.has(dependency)) {
        issues.push({
          code: "unknown-dependency",
          agent: node.agent,
          dependency,
          message: `Agent "${node.agent}" depends on "${dependency}", which pipeline "${definition.id}" does not define`,
        });
      }
    }
  }

  for (const agent of findCycleMembers(definition.nodes)) {
    issues.push({
      code: "cycle",
      agent,
      message: `Agent "${agent}" participates in a dependency cycle in pipeline "${definition.id}"`,
    });
  }

  return issues;
}

export interface PipelineSelection {
  /**
   * The selected nodes, always in definition order.
   *
   * Order comes from the definition and never from the request, so the same
   * requested set always produces the same plan.
   */
  readonly nodes: readonly PipelineNodeDefinition[];
  readonly issues: readonly PipelinePlanIssue[];
}

/**
 * Resolve which nodes a request selects.
 *
 * `requestedAgents` is client-supplied on the plan routes, so it is treated as
 * a request and not as an instruction: a name outside the definition is
 * rejected rather than turned into an ad-hoc node, and a selection that omits
 * a dependency is rejected rather than producing an edge to a node that will
 * never exist. The latter used to strand the executor — the node could never
 * become ready, so the run ended with nothing done, nothing failed, and no
 * stated reason.
 */
export function selectPipelineNodes(
  definition: PipelineDefinition,
  requestedAgents?: readonly string[],
): PipelineSelection {
  const definitionIssues = validatePipelineDefinition(definition);
  if (definitionIssues.length > 0) {
    return { nodes: [], issues: definitionIssues };
  }

  if (requestedAgents === undefined) {
    return { nodes: definition.nodes, issues: [] };
  }

  const issues: PipelinePlanIssue[] = [];
  const known = new Map(definition.nodes.map((node) => [node.agent, node]));
  const requested = new Set<string>();

  for (const agent of requestedAgents) {
    if (!known.has(agent)) {
      issues.push({
        code: "unknown-agent",
        agent,
        message: `Agent "${agent}" is not part of pipeline "${definition.id}"`,
      });
      continue;
    }
    requested.add(agent);
  }

  const nodes = definition.nodes.filter((node) => requested.has(node.agent));

  if (issues.length === 0 && nodes.length === 0) {
    issues.push({
      code: "empty-pipeline",
      message: `The requested agent selection for pipeline "${definition.id}" is empty`,
    });
  }

  for (const node of nodes) {
    for (const dependency of node.deps) {
      if (!requested.has(dependency)) {
        issues.push({
          code: "unsatisfied-dependency",
          agent: node.agent,
          dependency,
          message: `Agent "${node.agent}" depends on "${dependency}", which the requested selection omits`,
        });
      }
    }
  }

  return { nodes: issues.length > 0 ? [] : nodes, issues };
}

/**
 * Return every agent that sits on a dependency cycle.
 *
 * Strongly connected components, by Tarjan's algorithm, run iteratively — a
 * definition is operator-authored data and a cycle is exactly the case where a
 * recursive walk would be least welcome.
 *
 * A back-edge walk is not enough here, and the difference is not academic:
 * with `A → [B, C]`, `B → D`, `C → D`, `D → A`, the branch through `B` finds
 * the cycle and leaves `D` visited, so the later branch through `C` walks into
 * `D`, sees it already visited, and stops — never noticing that
 * `C → D → A → C` puts `C` on a cycle too. The plan is rejected either way,
 * but an operator is told to fix a subset of the real edges. An SCC has no
 * such blind spot: every member of a component larger than one node, and any
 * node depending on itself, is on a cycle.
 */
function findCycleMembers(
  nodes: readonly PipelineNodeDefinition[],
): readonly string[] {
  const edges = new Map(nodes.map((node) => [node.agent, node.deps]));
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const componentStack: string[] = [];
  const onComponentStack = new Set<string>();
  const members = new Set<string>();
  let counter = 0;

  const open = (agent: string): void => {
    index.set(agent, counter);
    lowlink.set(agent, counter);
    counter += 1;
    componentStack.push(agent);
    onComponentStack.add(agent);
  };

  for (const start of edges.keys()) {
    if (index.has(start)) continue;

    open(start);
    const work: Array<{ agent: string; nextIndex: number }> = [
      { agent: start, nextIndex: 0 },
    ];

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const deps = edges.get(frame.agent) ?? [];

      if (frame.nextIndex < deps.length) {
        const next = deps[frame.nextIndex];
        frame.nextIndex += 1;

        // A dependency on an agent the definition does not declare is
        // reported separately as `unknown-dependency`; it is not an edge.
        if (!edges.has(next)) continue;

        if (!index.has(next)) {
          open(next);
          work.push({ agent: next, nextIndex: 0 });
        } else if (onComponentStack.has(next)) {
          lowlink.set(
            frame.agent,
            Math.min(lowlink.get(frame.agent) ?? 0, index.get(next) ?? 0),
          );
        }
        continue;
      }

      work.pop();
      const parent = work[work.length - 1];
      if (parent) {
        lowlink.set(
          parent.agent,
          Math.min(
            lowlink.get(parent.agent) ?? 0,
            lowlink.get(frame.agent) ?? 0,
          ),
        );
      }

      if (lowlink.get(frame.agent) !== index.get(frame.agent)) continue;

      const component: string[] = [];
      let popped: string | undefined;
      do {
        popped = componentStack.pop();
        if (popped === undefined) break;
        onComponentStack.delete(popped);
        component.push(popped);
      } while (popped !== frame.agent);

      const selfDependent =
        component.length === 1 &&
        (edges.get(component[0]) ?? []).includes(component[0]);

      if (component.length > 1 || selfDependent) {
        for (const agent of component) members.add(agent);
      }
    }
  }

  return [...members];
}
