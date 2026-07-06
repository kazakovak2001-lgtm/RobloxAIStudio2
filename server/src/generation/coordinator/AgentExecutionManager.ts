/**
 * AgentExecutionManager.ts
 *
 * Coordinates agent execution within the generation pipeline.
 * Supports:
 *   - Sequential execution (default)
 *   - Dependency-aware execution (via AgentDependencyResolver)
 *   - Future parallel execution (interface ready)
 */

import { AgentRegistry } from "../../agents/core/AgentRegistry";
import type { GenerationContext } from "./types";

export interface AgentExecutionResult {
  agent: string;
  success: boolean;
  output: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

export class AgentExecutionManager {
  private agentRegistry: AgentRegistry;

  constructor(agentRegistry: AgentRegistry) {
    this.agentRegistry = agentRegistry;
  }

  /**
   * Execute a single agent with the given input.
   */
  async executeAgent(
    agentType: string,
    input: Record<string, unknown>,
  ): Promise<AgentExecutionResult> {
    const start = Date.now();
    try {
      const output = await this.agentRegistry.executeAgent(agentType, input);
      return {
        agent: agentType,
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        agent: agentType,
        success: false,
        output: {},
        durationMs: Date.now() - start,
        error,
      };
    }
  }

  /**
   * Execute agents sequentially in the given order.
   */
  async executeSequential(
    agents: string[],
    baseInput: Record<string, unknown>,
    ctx: GenerationContext,
  ): Promise<{
    results: AgentExecutionResult[];
    accumulatedOutputs: Record<string, unknown>;
  }> {
    const results: AgentExecutionResult[] = [];
    let accumulated: Record<string, unknown> = { ...baseInput };

    for (const agent of agents) {
      const result = await this.executeAgent(agent, accumulated);
      results.push(result);

      if (result.success) {
        accumulated = {
          ...accumulated,
          ...result.output,
          [agent]: result.output,
        };
        ctx.outputs[agent] = result.output;
      } else {
        // Stop on first failure for sequential mode
        break;
      }
    }

    return { results, accumulatedOutputs: accumulated };
  }

  /**
   * Execute agents respecting dependencies (topological order).
   */
  async executeDependencyAware(
    agentDeps: Array<{ agent: string; dependencies: string[] }>,
    baseInput: Record<string, unknown>,
    ctx: GenerationContext,
  ): Promise<{
    results: AgentExecutionResult[];
    accumulatedOutputs: Record<string, unknown>;
  }> {
    const resolved = AgentDependencyResolver.resolve(agentDeps);
    return this.executeSequential(resolved, baseInput, ctx);
  }
}

/**
 * AgentDependencyResolver
 *
 * Resolves agent execution order based on dependency graph (topological sort).
 */
export class AgentDependencyResolver {
  /**
   * Topological sort of agents based on dependencies.
   */
  static resolve(
    agentDeps: Array<{ agent: string; dependencies: string[] }>,
  ): string[] {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const { agent, dependencies } of agentDeps) {
      graph.set(agent, dependencies);
      if (!inDegree.has(agent)) inDegree.set(agent, 0);
      for (const dep of dependencies) {
        if (!inDegree.has(dep)) inDegree.set(dep, 0);
      }
    }

    // Count in-degrees
    for (const [agent, deps] of graph) {
      for (const _dep of deps) {
        // agent depends on dep → dep must come before agent
        inDegree.set(agent, (inDegree.get(agent) ?? 0) + 1);
      }
    }

    // BFS topological sort
    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      // For each agent that depends on current
      for (const [agent, deps] of graph) {
        if (deps.includes(current)) {
          inDegree.set(agent, (inDegree.get(agent) ?? 0) - 1);
          if (inDegree.get(agent) === 0) {
            queue.push(agent);
          }
        }
      }
    }

    return sorted;
  }
}
