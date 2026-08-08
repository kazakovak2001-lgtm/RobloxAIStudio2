/**
 * PROVIDER-1A — generation provenance.
 *
 * The platform ships deterministic fallbacks that are deliberately good enough
 * to satisfy the playability contract, so a process with no LLM still produces
 * a Studio-importable package. That is acceptable only while the resulting
 * execution is durably distinguishable from a real AI generation. These tests
 * pin that boundary.
 */

import { describe, it, expect, vi } from "vitest";
import {
  GameGenerationService,
  type GenerationProviderInfo,
} from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../socket/streaming";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ArtifactStore } from "../pipeline/v2";
import type { GenerationExecution } from "../types/blueprint";
import type { CreateBlueprintInput } from "../projects/types/blueprint";

const USER_ID = "provenance-user";
const PROJECT_ID = "provenance-project";

function blueprintInput(): CreateBlueprintInput {
  return {
    project_id: PROJECT_ID,
    user_id: USER_ID,
    name: "Provenance Test Game",
    description: "A blueprint used only to exercise generation provenance.",
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

/**
 * Drive one generation to a terminal state and return the durable record.
 * The service runs the pipeline on a detached queue, so poll rather than
 * assuming completion is synchronous.
 */
async function runGeneration(
  registry: AgentRegistry,
  providerInfo: GenerationProviderInfo,
): Promise<GenerationExecution> {
  const repository = new InMemoryBlueprintRepository();
  const service = new GameGenerationService(
    repository,
    new BlueprintCache(),
    new StreamingUpdateHandler(),
    new PipelineEventEmitter(),
    null,
    registry,
    new ArtifactStore(),
    undefined,
    providerInfo,
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

describe("generation provenance", () => {
  it("records a provider-less run as fallback, never as an AI generation", async () => {
    // No setLLM call: every agent falls through to its deterministic fallback.
    const execution = await runGeneration(new AgentRegistry(), {
      provider: null,
    });

    expect(execution.status).toBe("completed");
    expect(execution.ai_mode).toBe("fallback");
    expect(execution.ai_provider).toBeUndefined();
    expect(execution.ai_model).toBeUndefined();
  }, 20000);

  it("records provider and model when a real provider produced the content", async () => {
    const registry = new AgentRegistry();
    // Return an empty JSON object: the parser falls back per-key, but the LLM
    // was genuinely consulted, so this is a real AI run.
    registry.setLLM({ generate: vi.fn().mockResolvedValue("{}") });

    const execution = await runGeneration(registry, {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    });

    // The core claim of the slice: a provider-backed run is not labelled
    // fallback. Without this the suite would pass even if resolveProvenance
    // classified every run as fallback.
    expect(execution.ai_mode).toBe("ai");
    expect(execution.ai_provider).toBe("ollama");
    expect(execution.ai_model).toBe("qwen2.5-coder:7b");
  }, 20000);

  it("degrades to fallback if any stage returned canned content", async () => {
    // Wire every agent except lua_generator, so that one stage genuinely has
    // no LLM rather than being cast into that state. One canned stage is
    // enough to make the whole execution untrustworthy as an AI generation.
    const registry = new AgentRegistry();
    const llm = { generate: vi.fn().mockResolvedValue("{}") };
    for (const type of registry.registeredTypes()) {
      if (type !== "lua_generator") registry.getAgent(type)!.setLLM(llm);
    }

    const execution = await runGeneration(registry, {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    });

    expect(execution.ai_mode).toBe("fallback");
    // Provider identity is still recorded — it explains what was configured.
    expect(execution.ai_provider).toBe("ollama");
  }, 20000);
});

describe("fallback labelling", () => {
  it("tags agent output produced without an LLM", async () => {
    const registry = new AgentRegistry();

    const output = await registry.executeAgent("requirements", {
      goal: "Build a small obby",
      constraints: [],
    });

    expect(output._usedFallback).toBe(true);
  });

  it("does not tag output produced through a real LLM", async () => {
    const registry = new AgentRegistry();
    registry.setLLM({ generate: vi.fn().mockResolvedValue("{}") });

    const output = await registry.executeAgent("requirements", {
      goal: "Build a small obby",
      constraints: [],
    });

    expect(output._usedFallback).toBeUndefined();
  });
});
