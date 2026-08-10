import { describe, it, expect, vi, afterEach } from "vitest";

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
  // Restored unconditionally: a failing assertion must not leave the spied
  // binding in place for the provenance tests below, which would bury the
  // real failure under unrelated ones.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Replace one agent's model policy for the duration of a test.
   *
   * The original implementation is captured before spying so the pass-through
   * branch calls it rather than recursing into the spy.
   */
  async function withModelPolicy(
    agentId: string,
    model: { requiresModel: boolean; fallback: "allowed" | "forbidden" },
  ): Promise<void> {
    const contract = await import("../agents/contract/agentContract");
    const original = contract.getAgentDefinition;
    const patched = { ...original(agentId)!, model };
    vi.spyOn(contract, "getAgentDefinition").mockImplementation((id: string) =>
      id === agentId ? patched : original(id),
    );
  }

  it("refuses to satisfy a model-requiring agent with canned content", async () => {
    // No definition currently requires a model, so this drives the policy
    // directly rather than waiting for one to. The check must be about the
    // policy, not about what the fallback happened to return.
    const registry = new AgentRegistry();
    await withModelPolicy("planner", {
      requiresModel: true,
      fallback: "allowed",
    });

    const output = await registry.executeAgent("planner", {});

    expect(output._failed).toBe(true);
    expect(String(output._error)).toMatch(/requires a model provider/i);
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
    await withModelPolicy("planner", {
      requiresModel: false,
      fallback: "forbidden",
    });

    const output = await registry.executeAgent("planner", {});

    expect(output._failed).toBe(true);
    expect(String(output._error)).toMatch(/forbids/i);
  });

  it("leaves other agents on their real definitions while one is patched", async () => {
    // The pass-through branch must reach the original lookup. If it re-entered
    // the spy it would recurse rather than answer.
    await withModelPolicy("planner", {
      requiresModel: true,
      fallback: "allowed",
    });
    const contract = await import("../agents/contract/agentContract");

    expect(contract.getAgentDefinition("lua_generator")?.id).toBe(
      "lua_generator",
    );
    expect(contract.getAgentDefinition("no_such_agent")).toBeUndefined();
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

  it("reads a historical step back without assigning it a version", async () => {
    // Executions recorded before the contract carry no version. Nothing on the
    // read path may fill one in, because the definition that ran is unknown.
    const repository = new InMemoryBlueprintRepository();
    const blueprint = await repository.createBlueprint(USER_ID, {
      ...blueprintInput(),
      project_id: PROJECT_ID,
    });
    const historical: GenerationExecution = {
      id: "exec-historical",
      blueprint_id: blueprint.id,
      project_id: PROJECT_ID,
      user_id: USER_ID,
      status: "completed",
      started_at: new Date(),
      pipeline_steps: [{ agent: "planner", status: "completed" }],
    } as GenerationExecution;

    await repository.recordExecution(historical);
    const readBack = await repository.getExecution("exec-historical");

    expect(readBack).not.toBeNull();
    expect(readBack!.pipeline_steps[0].agent).toBe("planner");
    expect(readBack!.pipeline_steps[0].agent_version).toBeUndefined();
    // The current definition exists and still does not colour the old row.
    expect(getAgentDefinition("planner")?.version).toBe(1);
  });

  it("records no version for a step whose agent never ran", async () => {
    // A skipped node was blocked by an upstream failure, so no definition ran
    // for it. Claiming one would be provenance about work that did not happen.
    const registry = new AgentRegistry();
    const exploding = new (class extends BaseAgent {
      readonly name = "UIGenerator";
      readonly description = "Fails so its dependents are stranded";
      readonly inputSchema = {};
      readonly outputSchema = {};
      protected async process(): Promise<Record<string, unknown>> {
        throw new Error("deliberate ui failure");
      }
    })();
    (registry as unknown as { agents: Map<string, BaseAgent> }).agents.set(
      "ui_generator",
      exploding,
    );

    const execution = await runGeneration(registry);
    const steps = execution.pipeline_steps;
    const skipped = steps.filter((step) => step.status === "skipped");
    const ran = steps.filter((step) => step.status !== "skipped");

    expect(skipped.length).toBeGreaterThan(0);
    for (const step of skipped) {
      expect(step.agent_version).toBeUndefined();
    }
    // A failed step did reach its agent, so it keeps its version.
    expect(ran.some((step) => step.status === "failed")).toBe(true);
    expect(ran.length).toBeGreaterThan(0);
    for (const step of ran) {
      expect(step.agent_version).toBe(getAgentDefinition(step.agent)?.version);
    }
  }, 20000);
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

  it("matches the attempt count each implementation actually loops", () => {
    // Not the class default: `LuaGeneratorAgent` lowers its own ceiling to 1,
    // so the declared number is checked against the constructed agent.
    const ceilings = new AgentRegistry().attemptCeilings();

    for (const definition of AGENT_DEFINITIONS) {
      expect(ceilings[definition.id]).toBe(definition.execution.maxAttempts);
    }
    expect(ceilings.lua_generator).toBe(1);
  });
});
