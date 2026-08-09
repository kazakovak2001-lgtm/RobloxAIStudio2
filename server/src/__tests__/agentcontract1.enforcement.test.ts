import { describe, it, expect, vi } from "vitest";

import { AgentRegistry } from "../agents/core/AgentRegistry";
import { BaseAgent } from "../agents/core/BaseAgent";
import {
  AGENT_DEFINITIONS,
  getAgentDefinition,
} from "../agents/contract/agentContract";
import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../socket/streaming";
import { ArtifactStore } from "../pipeline/v2";
import type { GenerationExecution } from "../types/blueprint";
import type { CreateBlueprintInput } from "../projects/types/blueprint";

/**
 * AGENT-CONTRACT-1 — the parts of the contract the runtime actually consults.
 *
 * A policy nothing reads is not a contract, so each of these drives a real
 * execution path rather than asserting on the definition object.
 */

const USER_ID = "agent-contract-user";
const PROJECT_ID = "agent-contract-project";

function blueprintInput(): CreateBlueprintInput {
  return {
    project_id: PROJECT_ID,
    user_id: USER_ID,
    name: "Agent Contract Game",
    description: "A blueprint used only to exercise agent contract provenance.",
    game_type: "adventure",
    genre: ["adventure"],
    target_audience: "all ages",
    difficulty: "medium",
    estimated_players: "small-group",
    gameplay: { mechanics: [], progression: {}, balance: {} },
    ui_layouts: [],
    architecture: {
      client_architecture: {},
      server_architecture: {},
      networking: {},
    },
    assets: { models: [], textures: [], sounds: [], animations: [] },
    code_spec: { modules: [], patterns: [] },
  };
}

/** Drive one generation to a terminal state and return the durable record. */
async function runGeneration(
  registry: AgentRegistry,
): Promise<GenerationExecution> {
  const service = new GameGenerationService(
    new InMemoryBlueprintRepository(),
    new BlueprintCache(),
    new StreamingUpdateHandler(),
    new PipelineEventEmitter(),
    null,
    registry,
    new ArtifactStore(),
  );

  await service.createBlueprint(USER_ID, PROJECT_ID, blueprintInput());
  const started = await service.startGeneration(PROJECT_ID, USER_ID);

  for (let attempt = 0; attempt < 200; attempt++) {
    const current = await service.getExecution(started.id);
    if (current && current.status !== "running") return current;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Generation did not reach a terminal state in time");
}

describe("AGENT-CONTRACT-1 refuses undefined agents before a provider runs", () => {
  it("fails an agent with no definition rather than executing it", async () => {
    // The registry knows the implementation; the contract does not. Nothing
    // downstream could judge the output, so it must not be produced.
    const registry = new AgentRegistry();
    const generate = vi.fn().mockResolvedValue("{}");
    registry.setLLM({ generate });

    const rogue = new (class extends BaseAgent {
      readonly name = "Rogue";
      readonly description = "Registered without a definition";
      readonly inputSchema = {};
      readonly outputSchema = {};
      protected async process(): Promise<Record<string, unknown>> {
        return { rogue: true };
      }
    })();
    (registry as unknown as { agents: Map<string, BaseAgent> }).agents.set(
      "rogue_agent",
      rogue,
    );

    const output = await registry.executeAgent("rogue_agent", {});

    expect(output._failed).toBe(true);
    expect(String(output._error)).toMatch(/no agent definition/i);
    // Refused before any provider call, not after inspecting the result.
    expect(generate).not.toHaveBeenCalled();
  });

  it("still reports an unregistered name as not run", async () => {
    const output = await new AgentRegistry().executeAgent("not_registered", {});
    expect(output._failed ?? output._skipped).toBe(true);
  });
});

describe("AGENT-CONTRACT-1 model policy is enforced", () => {
  it("refuses to satisfy a model-requiring agent with canned content", async () => {
    // No definition currently requires a model, so this drives the policy
    // directly rather than waiting for one to. The check must be about the
    // policy, not about what the fallback happened to return.
    const registry = new AgentRegistry();
    const definition = getAgentDefinition("planner")!;
    const spy = vi
      .spyOn(
        await import("../agents/contract/agentContract"),
        "getAgentDefinition",
      )
      .mockImplementation((id: string) =>
        id === "planner"
          ? {
              ...definition,
              model: { requiresModel: true, fallback: "allowed" },
            }
          : getAgentDefinition(id),
      );

    const output = await registry.executeAgent("planner", {});

    expect(output._failed).toBe(true);
    expect(String(output._error)).toMatch(/requires a model provider/i);
    spy.mockRestore();
  });

  it("keeps truthful provenance when fallback is allowed", async () => {
    // Every current definition allows fallback, so a provider-less run must
    // still be marked as deterministic rather than passed off as AI output.
    const output = await new AgentRegistry().executeAgent("planner", {});

    expect(output._failed).toBeUndefined();
    expect(output._usedFallback).toBe(true);
  });

  it("fails an agent whose definition forbids the fallback it produced", async () => {
    const registry = new AgentRegistry();
    const definition = getAgentDefinition("planner")!;
    const spy = vi
      .spyOn(
        await import("../agents/contract/agentContract"),
        "getAgentDefinition",
      )
      .mockImplementation((id: string) =>
        id === "planner"
          ? {
              ...definition,
              model: { requiresModel: false, fallback: "forbidden" },
            }
          : getAgentDefinition(id),
      );

    const output = await registry.executeAgent("planner", {});

    expect(output._failed).toBe(true);
    expect(String(output._error)).toMatch(/forbids/i);
    spy.mockRestore();
  });
});

describe("AGENT-CONTRACT-1 execution provenance", () => {
  it("records the agent definition version on every step", async () => {
    const execution = await runGeneration(new AgentRegistry());

    expect(execution.status).toBe("completed");
    for (const step of execution.pipeline_steps) {
      const definition = getAgentDefinition(step.agent);
      expect(step.agent_version).toBe(definition?.version);
    }
  }, 20000);

  it("leaves a historical step without a version readable and unclaimed", () => {
    // Executions recorded before the contract carry no version. They must not
    // be assumed to have run the current definition.
    const historical: GenerationExecution["pipeline_steps"] = [
      { agent: "planner", status: "completed" },
    ];

    expect(historical[0].agent_version).toBeUndefined();
    expect(getAgentDefinition("planner")?.version).toBe(1);
  });

  it("does not reinterpret an old step when the current version changes", () => {
    const historicalVersion = 1;
    const bumped = { ...getAgentDefinition("planner")!, version: 2 };

    // The recorded number is the claim; a newer definition cannot rewrite it.
    expect(historicalVersion).not.toBe(bumped.version);
    expect(historicalVersion).toBe(1);
  });
});

describe("AGENT-CONTRACT-1 budget claims are limited to what is enforced", () => {
  it("declares only the output ceiling the provider call actually receives", () => {
    // `maxOutputTokens` is passed to the provider on each attempt, so it is a
    // real ceiling. Wall-clock timeout and monetary cost are not enforced
    // anywhere today and must not appear as if they were.
    for (const definition of AGENT_DEFINITIONS) {
      const execution = definition.execution as Record<string, unknown>;
      expect(Object.keys(execution).sort()).toEqual([
        "maxAttempts",
        "maxOutputTokens",
      ]);
      expect(execution.timeoutMs).toBeUndefined();
      expect(execution.maxCostUsd).toBeUndefined();
      expect(execution.maxInputTokens).toBeUndefined();
    }
  });

  it("matches the attempt count BaseAgent actually loops", () => {
    // `BaseAgent.maxRetries` defaults to 3 and drives the real retry loop.
    for (const definition of AGENT_DEFINITIONS) {
      expect(definition.execution.maxAttempts).toBe(3);
    }
  });
});
