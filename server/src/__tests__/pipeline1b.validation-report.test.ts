import { describe, it, expect } from "vitest";

import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ArtifactStore, type PipelineArtifact } from "../pipeline/v2";
import {
  STAGE_AGENT_MAP,
  createPipelineState,
  type PipelineState,
} from "../pipeline/v2/PipelineStage";
import { PipelineExecutor } from "../pipeline/v2/PipelineExecutor";
import {
  buildGenerationValidationReport,
  GENERATION_VALIDATION_ANALYSIS_MODE,
  GENERATION_VALIDATION_SCHEMA_VERSION,
  type GenerationValidationReport,
} from "../validation/generationValidation";
import type { TaskNode } from "../planning/model/TaskGraph";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../socket/streaming";

/** ARTIFACT-CONTRACT-2 requires an owning project on every new artifact. */
const ARTIFACT_TEST_PROJECT = "artifact-contract-test-project";

/**
 * PIPELINE-1B. What deterministic validation found is a durable artifact.
 *
 * A rejected generation still persists no content — that invariant is
 * STUDIO-1A's and is unchanged — but it no longer persists no *reason* either.
 */

const PLAYABLE_SERVER = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progress = Instance.new("RemoteEvent")
progress.Name = "OrbProgress"
progress.Parent = ReplicatedStorage

local arena = Instance.new("Folder")
arena.Name = "GeneratedArena"
arena.Parent = workspace

local spawnPad = Instance.new("SpawnLocation")
spawnPad.Size = Vector3.new(12, 1, 12)
spawnPad.Position = Vector3.new(0, 1, 0)
spawnPad.Anchored = true
spawnPad.Parent = arena

local collected = {}

for index = 1, 5 do
  local orb = Instance.new("Part")
  orb.Name = "Orb" .. index
  orb.Shape = Enum.PartType.Ball
  orb.Size = Vector3.new(2, 2, 2)
  orb.Position = Vector3.new(index * 6, 3, 0)
  orb.Anchored = true
  orb.Parent = arena

  orb.Touched:Connect(function(hit)
    local character = hit.Parent
    local player = Players:GetPlayerFromCharacter(character)
    if not player then
      return
    end
    if collected[orb] then
      return
    end
    collected[orb] = true
    orb:Destroy()

    local score = 0
    for _, taken in pairs(collected) do
      if taken then
        score = score + 1
      end
    end
    progress:FireAllClients(score, 5)
  end)
end

Players.PlayerAdded:Connect(function(player)
  local stats = Instance.new("Folder")
  stats.Name = "leaderstats"
  stats.Parent = player

  local score = Instance.new("IntValue")
  score.Name = "Score"
  score.Parent = stats
end)
`;

const PLAYABLE_CLIENT = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "OrbHud"
gui.ResetOnSpawn = false
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Name = "Progress"
label.Size = UDim2.new(0, 220, 0, 48)
label.Position = UDim2.new(0, 16, 0, 16)
label.Text = "Orbs: 0/5"
label.Parent = gui

local progress = ReplicatedStorage:WaitForChild("OrbProgress")
progress.OnClientEvent:Connect(function(score, goal)
  label.Text = "Orbs: " .. tostring(score) .. "/" .. tostring(goal)
end)
`;

function playableLuaOutput(): Record<string, unknown> {
  return {
    scripts: [
      {
        path: "ServerScriptService/OrbArena.server.lua",
        content: PLAYABLE_SERVER,
      },
      {
        path: "StarterPlayerScripts/OrbHud.client.lua",
        content: PLAYABLE_CLIENT,
      },
    ],
  };
}

/**
 * Lua that reads as scripts but does not satisfy the playability contract.
 *
 * Deliberately not `{ scripts: [] }`: that fails to parse as scripts at all
 * and takes an earlier branch, so it would never exercise what happens when
 * the contract itself rejects readable output.
 */
function unplayableLuaOutput(): Record<string, unknown> {
  return {
    scripts: [
      {
        path: "ServerScriptService/Stub.server.lua",
        content: "print('nothing here')\n",
      },
    ],
  };
}

function node(agent: string, output: Record<string, unknown>): TaskNode {
  return {
    id: `task-${agent}`,
    agent,
    type: "stage",
    input: {},
    dependencies: [],
    status: "done",
    priority: 1,
    output,
  };
}

function validationReport(
  artifacts: readonly PipelineArtifact[],
): GenerationValidationReport {
  const artifact = artifacts.find((entry) => entry.stage === "VALIDATION");
  if (!artifact) throw new Error("No VALIDATION artifact was recorded");
  return artifact.content as GenerationValidationReport;
}

describe("PIPELINE-1B validation report", () => {
  it("carries its schema version and analysis mode on the durable record", () => {
    const report = buildGenerationValidationReport({
      luaPresent: true,
      luaIssues: [],
      ui: { status: "built" },
    });

    expect(report.schemaVersion).toBe(GENERATION_VALIDATION_SCHEMA_VERSION);
    expect(report.analysisMode).toBe(GENERATION_VALIDATION_ANALYSIS_MODE);
    expect(report.passed).toBe(true);
  });

  it("states its own limits so a clean report is not read as proof", () => {
    const report = buildGenerationValidationReport({
      luaPresent: true,
      luaIssues: [],
      ui: { status: "built" },
    });

    expect(report.limits.length).toBeGreaterThan(0);
    expect(report.limits.join(" ")).toContain("No Lua is executed");
  });

  it("does not let an advisory failure clear or block the report", () => {
    const report = buildGenerationValidationReport({
      luaPresent: true,
      luaIssues: [],
      ui: { status: "failed", reason: "screen name is not allowed" },
    });

    const ui = report.checks.find((check) => check.id === "ui-materializable");
    expect(ui?.status).toBe("failed");
    expect(ui?.enforcement).toBe("advisory");
    expect(report.advisoryFailures).toBe(1);
    expect(report.blockingFailures).toBe(0);
    // Advisory means advisory: the execution is not failed by this alone.
    expect(report.passed).toBe(true);
  });

  it("keeps the playability contract blocking", () => {
    const report = buildGenerationValidationReport({
      luaPresent: true,
      luaIssues: ["server code must create playable world instances"],
      ui: { status: "built" },
    });

    expect(report.blockingFailures).toBe(1);
    expect(report.passed).toBe(false);
  });

  it("does not report a check as passed when it never ran", () => {
    const report = buildGenerationValidationReport({
      luaPresent: false,
      // Findings from an earlier attempt must not be attached to a check that
      // did not run — a consumer rendering details would show results for work
      // that never happened.
      luaIssues: ["server code must create playable world instances"],
      ui: { status: "not-attempted" },
    });

    const playable = report.checks.find((check) => check.id === "lua-playable");
    const ui = report.checks.find((check) => check.id === "ui-materializable");
    expect(playable?.status).toBe("not-applicable");
    expect(playable?.details).toEqual([]);
    expect(ui?.status).toBe("not-applicable");
    // No Lua at all is itself a blocking failure — there is no game.
    expect(report.passed).toBe(false);
  });
});

describe("PIPELINE-1B recorder", () => {
  it("leaves the report and nothing else when the Lua contract fails", async () => {
    // Two invariants meet here. STUDIO-1A: a rejected generation persists no
    // content, so nothing a later consumer could mistake for a deliverable
    // package survives. PIPELINE-1B: the reason it was rejected is durable,
    // where before it existed only as an exception message.
    const store = new ArtifactStore();
    const recorder = new GenerationArtifactRecorder(store);

    await expect(
      recorder.record(
        "failing-exec",
        [
          node("requirements", { requirements: { ok: true } }),
          node("game_designer", { gameDesign: { ok: true } }),
          node("lua_generator", unplayableLuaOutput()),
          node("ui_generator", { uiDesign: { screens: [] } }),
          node("asset_planner", { assetPlan: { ok: true } }),
          node("orchestrator", { exportPackage: { ok: true } }),
        ],
        ARTIFACT_TEST_PROJECT,
      ),
    ).rejects.toThrow(/deterministic validation/);

    const stages = (await store.getByPipeline("failing-exec")).map(
      (artifact) => artifact.stage,
    );

    expect(stages).toEqual(["VALIDATION"]);
  });

  it("records why the run was blocked, not only that it was", async () => {
    const store = new ArtifactStore();
    const recorder = new GenerationArtifactRecorder(store);

    await expect(
      recorder.record(
        "blocked-exec",
        [node("lua_generator", { scripts: [] })],
        ARTIFACT_TEST_PROJECT,
      ),
    ).rejects.toThrow();

    const report = validationReport(await store.getByPipeline("blocked-exec"));
    const playable = report.checks.find((check) => check.id === "lua-playable");

    expect(report.passed).toBe(false);
    expect(playable?.status).toBe("failed");
    expect(playable?.details.length).toBeGreaterThan(0);
  });

  it("records a passing report for a playable generation", async () => {
    const store = new ArtifactStore();
    const recorder = new GenerationArtifactRecorder(store);

    const recorded = await recorder.record(
      "good-exec",
      [
        node("requirements", { requirements: { ok: true } }),
        node("lua_generator", playableLuaOutput()),
      ],
      ARTIFACT_TEST_PROJECT,
    );

    const report = validationReport(recorded);
    expect(report.passed).toBe(true);
    expect(report.blockingFailures).toBe(0);
    expect(recorded.map((artifact) => artifact.stage)).toContain(
      "LUA_GENERATION",
    );
  });

  it("still writes the report when the UI output cannot be read at all", async () => {
    // UI materialization is advisory, so output too malformed to read must not
    // abort the run — that would leave no report, the exact gap this closes.
    const store = new ArtifactStore();
    const recorder = new GenerationArtifactRecorder(store);

    const recorded = await recorder.record(
      "ui-malformed-exec",
      [
        node("lua_generator", playableLuaOutput()),
        { ...node("ui_generator", {}), output: "not an object" as never },
      ],
      ARTIFACT_TEST_PROJECT,
    );

    const ui = validationReport(recorded).checks.find(
      (check) => check.id === "ui-materializable",
    );

    expect(ui?.status).toBe("failed");
    expect(ui?.details.length).toBeGreaterThan(0);
    expect(validationReport(recorded).passed).toBe(true);
  });

  it("carries a lost UI materialization failure into the report", async () => {
    // Regression. The reason was written to `console.warn` and nowhere else,
    // so nothing durable recorded that the UI had not materialized.
    const store = new ArtifactStore();
    const recorder = new GenerationArtifactRecorder(store);

    const recorded = await recorder.record(
      "ui-exec",
      [
        node("lua_generator", playableLuaOutput()),
        node("ui_generator", { uiDesign: { screens: [] } }),
      ],
      ARTIFACT_TEST_PROJECT,
    );

    const ui = validationReport(recorded).checks.find(
      (check) => check.id === "ui-materializable",
    );

    expect(ui?.status).toBe("failed");
    expect(ui?.details.length).toBeGreaterThan(0);
  });
});

describe("PIPELINE-1B provenance of a failed run", () => {
  it("claims nothing when no agent produced content", async () => {
    // `getAllNodes()` includes failed and skipped nodes, so counting those
    // would let a run whose agents all failed — producing nothing at all — be
    // labelled `ai` on the strength of a configured provider and the absence
    // of a fallback marker that nothing was there to set.
    const registry = {
      executeAgent: async () => ({ _failed: true, _error: "no" }),
    } as unknown as AgentRegistry;

    const service = new GameGenerationService(
      new InMemoryBlueprintRepository(),
      new BlueprintCache(),
      new StreamingUpdateHandler(),
      new PipelineEventEmitter(),
      null,
      registry,
      new ArtifactStore(),
      undefined,
      { provider: "ollama", model: "qwen2.5-coder:7b" },
    );

    await service.createBlueprint("p1b-user", "p1b-project", {
      project_id: "p1b-project",
      user_id: "p1b-user",
      name: "Provenance Of A Failed Run",
      description: "A blueprint used only to exercise failed-run provenance.",
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
    });

    const started = await service.startGeneration("p1b-project", "p1b-user");
    let execution = await service.getExecution(started.id);
    for (
      let attempt = 0;
      attempt < 200 && execution?.status === "running";
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      execution = await service.getExecution(started.id);
    }

    expect(execution?.status).toBe("failed");
    expect(execution?.ai_mode).toBeUndefined();
    // What was configured is still recorded — that is not a claim about
    // authorship.
    expect(execution?.ai_provider).toBe("ollama");
  }, 20000);
});

/** A saved pipeline state whose Lua stage completed with the given output. */
function pipelineStateWithLua(output: Record<string, unknown>): PipelineState {
  const state = createPipelineState("v2-project");
  const luaStage = state.stages.find(
    (stage) => stage.name === "LUA_GENERATION",
  );
  if (!luaStage) throw new Error("No LUA_GENERATION stage in the state");
  luaStage.status = "completed";
  luaStage.output = output;
  return state;
}

/** Run the VALIDATION stage the way the executor does, and return its output. */
function runValidationStage(
  executor: PipelineExecutor,
  sessionId: string,
  state: PipelineState,
): Promise<Record<string, unknown>> {
  const stage = state.stages.find((entry) => entry.name === "VALIDATION");
  if (!stage) throw new Error("No VALIDATION stage in the state");

  return (
    executor as unknown as {
      executeStage: (
        stage: unknown,
        sessionId: string,
        agentExecutor: () => Promise<Record<string, unknown>>,
        state: PipelineState,
      ) => Promise<Record<string, unknown>>;
    }
  ).executeStage(
    stage,
    sessionId,
    () => Promise.reject(new Error("no agent may run for VALIDATION")),
    state,
  );
}

describe("PIPELINE-1B v2 pipeline", () => {
  it("does not run an agent for the validation stage", () => {
    // `tester` emits a checklist whose every entry is `pending`, alongside
    // `passed: 0, failed: 0`. Stored as `validationReport.json` that reads as
    // a clean validation result for work that never ran.
    expect(STAGE_AGENT_MAP.VALIDATION).toBeNull();
  });

  it("persists a real validation report rather than a passthrough", async () => {
    const executor = new PipelineExecutor();
    const context = executor.getContext();
    const sessionId = context.createSession("v2-project", {});
    context.recordAgentOutput(sessionId, "lua_generator", playableLuaOutput());

    const output = await runValidationStage(
      executor,
      sessionId,
      pipelineStateWithLua(playableLuaOutput()),
    );

    expect(output._passthrough).toBeUndefined();
    expect(output.schemaVersion).toBe(GENERATION_VALIDATION_SCHEMA_VERSION);
    expect(output.analysisMode).toBe(GENERATION_VALIDATION_ANALYSIS_MODE);
    expect(output.passed).toBe(true);
  });

  it("reads the saved stage output when a resumed session has none", async () => {
    // Regression. `resume()` opens a fresh context session, so a run that
    // failed after LUA_GENERATION and is retried sees an empty accumulated
    // context. Reading only that reported `lua-generated` as failed for a
    // pipeline holding perfectly good Lua — a durable report asserting the
    // opposite of what happened.
    const executor = new PipelineExecutor();
    const emptySession = executor.getContext().createSession("resumed", {});

    const output = await runValidationStage(
      executor,
      emptySession,
      pipelineStateWithLua(playableLuaOutput()),
    );

    expect(output.passed).toBe(true);
    const checks = output.checks as GenerationValidationReport["checks"];
    expect(checks.find((check) => check.id === "lua-generated")?.status).toBe(
      "passed",
    );
  });

  it("separates Lua it could not read from Lua that was never produced", async () => {
    const executor = new PipelineExecutor();
    const emptySession = executor.getContext().createSession("malformed", {});

    const output = await runValidationStage(
      executor,
      emptySession,
      pipelineStateWithLua({ scripts: "not an array" }),
    );

    const checks = output.checks as GenerationValidationReport["checks"];
    const generated = checks.find((check) => check.id === "lua-generated");
    const playable = checks.find((check) => check.id === "lua-playable");

    // The stage did produce output, so this is not "no Lua" — it is Lua the
    // contract could not read, and the reason is on the report.
    expect(generated?.status).toBe("passed");
    expect(playable?.status).toBe("failed");
    expect(playable?.details.length).toBeGreaterThan(0);
    expect(output.passed).toBe(false);
  });
});
