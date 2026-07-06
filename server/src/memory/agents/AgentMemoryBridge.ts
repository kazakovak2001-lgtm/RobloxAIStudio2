/**
 * AgentMemoryBridge.ts
 *
 * Hooks into agent execution to inject/store memory automatically.
 * Non-blocking: memory failure never affects agent output.
 *
 * Usage by orchestrator:
 *   const memory = await bridge.retrieveForAgent(agentType, input);
 *   const enrichedInput = { ...input, ...memory.merged, _memoryContext: memory };
 *   const output = await agent.execute(enrichedInput);
 *   await bridge.storeFromAgent(agentType, input, output);
 */

import {
  MemoryEngine,
  type RetrievedMemory,
  type MemoryContext,
} from "../core/MemoryEngine";

export class AgentMemoryBridge {
  private engine: MemoryEngine;

  constructor(engine?: MemoryEngine) {
    this.engine = engine ?? new MemoryEngine();
  }

  /**
   * Retrieve relevant memory before agent execution.
   * Builds a query from the input context.
   */
  async retrieveForAgent(
    agentId: string,
    input: Record<string, unknown>,
    projectId?: string,
  ): Promise<RetrievedMemory> {
    try {
      const query = this.buildQueryFromInput(input);
      return await this.engine.retrieveMemory(agentId, query, projectId);
    } catch {
      return { entries: [], semanticMatches: [], merged: {} };
    }
  }

  /**
   * Store agent output into long-term memory after execution.
   */
  async storeFromAgent(
    agentId: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    projectId?: string,
  ): Promise<void> {
    try {
      // Don't store failed outputs
      if (output._failed || output._skipped) return;

      const context: MemoryContext = {
        agentId,
        projectId,
        input,
        output,
        timestamp: new Date(),
      };

      await this.engine.storeMemory(context);
    } catch {
      // Memory store failure is non-critical
    }
  }

  /**
   * Get the underlying engine for direct access.
   */
  getEngine(): MemoryEngine {
    return this.engine;
  }

  private buildQueryFromInput(input: Record<string, unknown>): string {
    // Build a search query from significant input fields
    const parts: string[] = [];

    const blueprint = input.blueprint as Record<string, unknown> | undefined;
    if (blueprint?.name) parts.push(String(blueprint.name));
    if (blueprint?.game_type) parts.push(String(blueprint.game_type));
    if (blueprint?.description)
      parts.push(String(blueprint.description).slice(0, 100));

    const seed = input.gameDesignSeed as Record<string, unknown> | undefined;
    if (seed?.coreLoop) parts.push(String(seed.coreLoop));
    if (seed?.theme) parts.push(String(seed.theme));

    if (parts.length === 0) {
      // Fallback: use first few string values from input
      for (const value of Object.values(input)) {
        if (
          typeof value === "string" &&
          value.length > 5 &&
          value.length < 200
        ) {
          parts.push(value);
          if (parts.length >= 3) break;
        }
      }
    }

    return parts.join(" ");
  }
}
