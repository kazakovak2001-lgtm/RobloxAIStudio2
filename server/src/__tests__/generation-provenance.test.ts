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
 * The union of every required key across the registered agents, so one mocked
 * response satisfies whichever agent receives it. Values are deliberately not
 * the agents' own fallback values — a response echoing canned content would
 * prove nothing about authorship.
 */
/**
 * Playable Lua for the mocked response. `LuaGeneratorAgent` post-validates
 * against `assertPlayableLuaScripts`, so a fixture without this fails the
 * stage and the run never reaches a completed AI-backed state.
 *
 * Authored here rather than reused from the agent's own fallback so the test
 * proves the model path, and deliberately distinct from it. Provenance is
 * structural, so content that happens to resemble a fallback is still
 * model-authored when the model supplied it.
 */
const MODEL_AUTHORED_LUA = {
  server: [
    {
      name: "OrbArena.server.lua",
      code: `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progress = Instance.new("RemoteEvent")
progress.Name = "OrbProgress"
progress.Parent = ReplicatedStorage

local arena = Instance.new("Folder")
arena.Name = "OrbArena"
arena.Parent = workspace

local collected = 0
for index = 1, 3 do
  local orb = Instance.new("Part")
  orb.Name = "Orb" .. index
  orb.Anchored = true
  orb.Shape = Enum.PartType.Ball
  orb.Position = Vector3.new(index * 6, 4, 0)
  orb.Parent = arena
  orb.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if not player or not orb.Parent then return end
    collected = collected + 1
    orb:Destroy()
    progress:FireAllClients(collected, 3)
  end)
end`,
    },
  ],
  client: [
    {
      name: "OrbHud.client.lua",
      code: `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "OrbHud"
gui.ResetOnSpawn = false
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Size = UDim2.fromOffset(320, 48)
label.Position = UDim2.fromOffset(16, 16)
label.TextScaled = true
label.Text = "Orbs collected: 0/3"
label.Parent = gui

ReplicatedStorage:WaitForChild("OrbProgress").OnClientEvent:Connect(function(count, target)
  label.Text = "Orbs collected: " .. count .. "/" .. target
end)`,
    },
  ],
  shared: [],
  modules: [],
};

const FULLY_VALID_OUTPUT: Record<string, unknown> = {
  lua_generator: MODEL_AUTHORED_LUA,
  requirements: { functional: ["model-authored requirement"] },
  plan: { steps: ["model-authored step"] },
  gameplay: { mechanics: [{ name: "model-authored mechanic" }] },
  architecture: { services: ["ModelAuthoredService"] },
  roblox_architect: { services: ["ModelAuthoredService"] },
  assetPlan: { models: ["model-authored asset"] },
  uiDesign: {
    screens: [
      { name: "ModelHUD", type: "hud", elements: [{ id: "a", label: "A" }] },
    ],
  },
  database: { tables: [] },
  documentation: { sections: [] },
  testResults: { passed: 1 },
  optimization: { suggestions: [] },
  review: { findings: [] },
  debugReport: { issues: [] },
  name: "ModelAuthoredGame",
  world: { regions: [] },
  systems: ["model-authored system"],
  status: "ok",
};

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
    registry.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(FULLY_VALID_OUTPUT)),
    });

    const execution = await runGeneration(registry, {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    });

    // Assert the run actually succeeded. Without this the test passes on a
    // failed generation, which is how a fixture missing `lua_generator` slipped
    // through review — a failed run has no AI-authored artifacts to speak of.
    expect(execution.status).toBe("completed");
    expect(
      execution.pipeline_steps.every((step) => step.status === "completed"),
    ).toBe(true);

    // The core claim of the slice: a provider-backed run is not labelled
    // fallback. Without this the suite would pass even if resolveProvenance
    // classified every run as fallback.
    expect(execution.ai_mode).toBe("ai");
    expect(execution.ai_provider).toBe("ollama");
    expect(execution.ai_model).toBe("qwen2.5-coder:7b");
  }, 20000);

  /**
   * A third route to canned content, found in review: `LuaGeneratorAgent`
   * post-validates the model's Lua and substitutes `safeRepairFallback` when
   * it fails the playability contract. That never passes through the parser,
   * so the agent has to declare it or the run claims the model authored it.
   */
  it("does not report a Lua safe repair as ai", async () => {
    const registry = new AgentRegistry();
    // Valid JSON carrying every required key, but Lua that cannot satisfy the
    // playability contract, so the agent falls back to its safe repair.
    registry.setLLM({
      generate: vi.fn().mockResolvedValue(
        JSON.stringify({
          ...FULLY_VALID_OUTPUT,
          lua_generator: {
            server: [{ name: "Empty.server.lua", code: "-- nothing" }],
            client: [{ name: "Empty.client.lua", code: "-- nothing" }],
            shared: [],
            modules: [],
          },
        }),
      ),
    });

    const execution = await runGeneration(registry, {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    });

    expect(execution.ai_mode).toBe("fallback");
    expect(execution.ai_provider).toBe("ollama");
  }, 20000);

  /**
   * PROVIDER-1B. Calling the model is not the model authoring the artifact.
   * `{}` parses cleanly, so every required key is repaired from the canned
   * fallback and the run previously reported `ai`.
   */
  it("does not report a run repaired from canned values as ai", async () => {
    const registry = new AgentRegistry();
    registry.setLLM({ generate: vi.fn().mockResolvedValue("{}") });

    const execution = await runGeneration(registry, {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    });

    expect(execution.ai_mode).toBe("fallback");
    // Provider identity still records what was configured.
    expect(execution.ai_provider).toBe("ollama");
  }, 20000);

  /**
   * The more dangerous case: an unparseable response substitutes the entire
   * fallback, so every required key is present and nothing downstream noticed.
   */
  it("does not report a run built from an unparseable response as ai", async () => {
    const registry = new AgentRegistry();
    registry.setLLM({
      generate: vi.fn().mockResolvedValue("I'm sorry, I can't help with that."),
    });

    const execution = await runGeneration(registry, {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    });

    expect(execution.ai_mode).toBe("fallback");
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

  it("does not tag output the model actually authored", async () => {
    const registry = new AgentRegistry();
    registry.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(FULLY_VALID_OUTPUT)),
    });

    const output = await registry.executeAgent("requirements", {
      goal: "Build a small obby",
      constraints: [],
    });

    expect(output._usedFallback).toBeUndefined();
  });

  it("tags output whose required keys were repaired from canned values", async () => {
    const registry = new AgentRegistry();
    registry.setLLM({ generate: vi.fn().mockResolvedValue("{}") });

    const output = await registry.executeAgent("requirements", {
      goal: "Build a small obby",
      constraints: [],
    });

    expect(output._usedFallback).toBe(true);
  });

  it("tags output substituted wholesale after an unparseable response", async () => {
    const registry = new AgentRegistry();
    registry.setLLM({ generate: vi.fn().mockResolvedValue("no json here") });

    const output = await registry.executeAgent("requirements", {
      goal: "Build a small obby",
      constraints: [],
    });

    expect(output._usedFallback).toBe(true);
  });
});
