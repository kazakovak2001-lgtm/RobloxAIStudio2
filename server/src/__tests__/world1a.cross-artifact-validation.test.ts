import { describe, it, expect } from "vitest";

import {
  buildWorldModel,
  WORLD_MODEL_SCHEMA_VERSION,
  WORLD_ROLES,
  type WorldModel,
} from "../validation/worldModel";
import {
  crossValidateWorld,
  WORLD_CROSS_ANALYSIS_MODE,
} from "../validation/worldCrossValidation";
import { buildGenerationValidationReport } from "../validation/generationValidation";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ArtifactStore } from "../pipeline/v2";
import {
  STAGE_ORDER,
  STAGE_AGENT_MAP,
  createPipelineState,
  type PipelineState,
} from "../pipeline/v2/PipelineStage";
import { PipelineExecutor } from "../pipeline/v2/PipelineExecutor";
import type { PlayableLuaScript } from "../types/playableLua";
import type { TaskNode } from "../planning/model/TaskGraph";

/**
 * WORLD-1A. The world model is semantic, non-canonical and unmaterialized, and
 * the first check in this platform that compares two artifacts to each other.
 */

const SERVER_LUA = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progress = Instance.new("RemoteEvent")
progress.Name = "OrbProgress"
progress.Parent = ReplicatedStorage

local arena = Instance.new("Folder")
arena.Name = "GeneratedArena"
arena.Parent = workspace

local spawnPad = Instance.new("SpawnLocation")
spawnPad.Size = Vector3.new(12, 1, 12)
spawnPad.Anchored = true
spawnPad.Parent = arena

local collected = {}

for index = 1, 5 do
  local orb = Instance.new("Part")
  orb.Name = "Orb" .. index
  orb.Anchored = true
  orb.Parent = arena

  orb.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if not player then
      return
    end
    if collected[orb] then
      return
    end
    collected[orb] = true
    orb:Destroy()
    progress:FireAllClients(1, 5)
  end)
end

Players.PlayerAdded:Connect(function(player)
  local stats = Instance.new("Folder")
  stats.Name = "leaderstats"
  stats.Parent = player
end)
`;

const CLIENT_LUA = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Name = "OrbHud"
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Text = "Orbs: 0/5"
label.Parent = gui

ReplicatedStorage:WaitForChild("OrbProgress").OnClientEvent:Connect(function(score, goal)
  label.Text = "Orbs: " .. tostring(score) .. "/" .. tostring(goal)
end)
`;

function luaPackage(): PlayableLuaScript[] {
  return [
    { path: "ServerScriptService/Arena.server.lua", content: SERVER_LUA },
    { path: "StarterPlayerScripts/Hud.client.lua", content: CLIENT_LUA },
  ];
}

/** A design and architecture pair for a game that is not a collect-em-up. */
function racingSources() {
  return {
    gameDesign: {
      gameplay: {
        mechanics: [
          { name: "drifting", description: "Players drift through corners" },
          { name: "boosting", description: "Players spend charge to boost" },
        ],
        balance: {
          winCondition: "Cross the finish line first",
          loseCondition: "Fail to finish before the timer expires",
          economyOrScoring: "Lap times converted into placement points",
        },
        progression: { player_progression_model: "Unlock tracks by placing" },
      },
    },
    architecture: {
      architecture: {
        services: {
          SpawnService: "Places racers on the grid",
          DataService: "Persists best lap times",
          EventService: "Broadcasts lap and placement changes",
        },
        apiContracts: { "Race.LapComplete": { input: "lap", output: "times" } },
      },
    },
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

describe("WORLD-1A world model", () => {
  it("is not built around one gameplay template", () => {
    // A racing game and a tycoon share no nouns with collect-the-orbs, so if
    // the model only fits the platform's own fallback game, it describes a
    // template rather than a world.
    const racing = buildWorldModel(racingSources());
    const tycoon = buildWorldModel({
      gameDesign: {
        gameplay: {
          mechanics: [{ name: "purchasing droppers" }],
          balance: { winCondition: "Own every dropper on the plot" },
        },
      },
      architecture: {
        architecture: { services: { SaveService: "Persists plot state" } },
      },
    });

    expect(racing.entities.map((entity) => entity.title)).toEqual([
      "drifting",
      "boosting",
    ]);
    expect(tycoon.entities.map((entity) => entity.title)).toEqual([
      "purchasing droppers",
    ]);
    expect(racing.systems.some((s) => s.role === "player-entry")).toBe(true);
    expect(tycoon.systems.some((s) => s.role === "persistence")).toBe(true);
  });

  it("carries roles, relationships, constraints and dependencies", () => {
    const world = buildWorldModel(racingSources());

    expect(world.schemaVersion).toBe(WORLD_MODEL_SCHEMA_VERSION);
    expect(world.relationships.length).toBeGreaterThan(0);
    expect(world.constraints.length).toBeGreaterThan(0);
    expect(world.dependencies.length).toBeGreaterThan(0);
    expect(
      world.dependencies.every((dependency) =>
        dependency.requires.every((id) =>
          world.systems.some((system) => system.id === id),
        ),
      ),
    ).toBe(true);
  });

  it("claims nothing when the design claimed nothing", () => {
    // Padding an empty model with defaults would invent claims to validate,
    // and every one of them would then be checked against real code.
    const world = buildWorldModel({});

    expect(world.entities).toEqual([]);
    // Only the presentation claim the playability contract makes for every
    // game survives, and it is sourced as such.
    expect(world.systems.map((system) => system.id)).toEqual(["presentation"]);
  });

  it("states its own limits, including that it is not canonical", () => {
    const world = buildWorldModel(racingSources());
    expect(world.limits.join(" ")).toContain("non-canonical");
    expect(world.limits.join(" ")).toContain("not geometry");
  });
});

describe("WORLD-1A cross-artifact validation", () => {
  it("confirms claims the generated Lua actually supports", () => {
    const result = crossValidateWorld(
      buildWorldModel(racingSources()),
      luaPackage(),
    );

    expect(result.analysisMode).toBe(WORLD_CROSS_ANALYSIS_MODE);
    const byId = new Map(result.claims.map((claim) => [claim.claimId, claim]));
    expect(byId.get("service-spawnservice")?.status).toBe("supported");
    expect(byId.get("presentation")?.status).toBe("supported");
    expect(byId.get("mechanic-1")?.status).toBe("supported");
  });

  it("catches a claimed system the code never implements", () => {
    // The whole point of the slice: a generation claims persistence, ships
    // code that never touches a DataStore, and every existing gate stays green.
    const result = crossValidateWorld(
      buildWorldModel(racingSources()),
      luaPackage(),
    );

    const persistence = result.claims.find(
      (claim) => claim.claimId === "service-dataservice",
    );
    expect(persistence?.status).toBe("unsupported");
    expect(result.unsupported).toBeGreaterThan(0);
  });

  it("does not accept client evidence for a server claim", () => {
    // Spawning is the server's job. Source that only mentions it on the client
    // must not satisfy the claim, or the check would confirm the one thing it
    // exists to catch.
    const clientOnly: PlayableLuaScript[] = [
      {
        path: "ServerScriptService/Empty.server.lua",
        content: "local x = 1\n",
      },
      {
        path: "StarterPlayerScripts/Hud.client.lua",
        content: `${CLIENT_LUA}\nlocal fake = Instance.new("SpawnLocation")\n`,
      },
    ];

    const result = crossValidateWorld(
      buildWorldModel(racingSources()),
      clientOnly,
    );
    const entry = result.claims.find(
      (claim) => claim.claimId === "service-spawnservice",
    );

    expect(entry?.status).toBe("unsupported");
  });

  it("reports a claim nothing could settle as unverifiable, never supported", () => {
    const world: WorldModel = {
      ...buildWorldModel({}),
      systems: [
        {
          id: "rule-1",
          role: "server-authority",
          title: "The server decides who wins",
          source: "architecture",
        },
      ],
    };

    const result = crossValidateWorld(world, luaPackage());

    expect(result.claims[0]?.status).toBe("unverifiable");
    expect(result.unsupported).toBe(0);
    expect(result.unverifiable).toBe(1);
  });

  it("decides what would prove every role rather than defaulting to a pass", () => {
    // Every role must be reachable through the evidence map. A role added
    // later with no entry would otherwise fall through to a silent pass.
    const world: WorldModel = {
      ...buildWorldModel({}),
      systems: WORLD_ROLES.map((role, index) => ({
        id: `role-${index}`,
        role,
        title: role,
        source: "blueprint" as const,
      })),
    };

    const result = crossValidateWorld(world, []);

    expect(result.claims).toHaveLength(WORLD_ROLES.length);
    expect(
      result.claims.every((claim) => claim.expectation.trim().length > 0),
    ).toBe(true);
    // With no Lua at all, nothing can be supported.
    expect(result.supported).toBe(0);
  });
});

describe("WORLD-1A evidence must be executable code", () => {
  it("does not accept a comment as evidence that a system exists", () => {
    // The direction of error that matters: a comment describing an integration
    // nobody wrote would turn an unmet claim into a supported one.
    const commented: PlayableLuaScript[] = [
      {
        path: "ServerScriptService/Arena.server.lua",
        content: `${SERVER_LUA}\n-- TODO: wire DataStoreService for best lap times\n`,
      },
      { path: "StarterPlayerScripts/Hud.client.lua", content: CLIENT_LUA },
    ];

    const result = crossValidateWorld(
      buildWorldModel(racingSources()),
      commented,
    );

    expect(
      result.claims.find((claim) => claim.claimId === "service-dataservice")
        ?.status,
    ).toBe("unsupported");
  });

  it("does not accept a string literal as evidence either", () => {
    const stringly: PlayableLuaScript[] = [
      {
        path: "ServerScriptService/Arena.server.lua",
        content: `${SERVER_LUA}\nlocal note = "someday call GetAsync(bestLapKey) here"\n`,
      },
      { path: "StarterPlayerScripts/Hud.client.lua", content: CLIENT_LUA },
    ];

    const result = crossValidateWorld(
      buildWorldModel(racingSources()),
      stringly,
    );

    expect(
      result.claims.find((claim) => claim.claimId === "service-dataservice")
        ?.status,
    ).toBe("unsupported");
  });

  it("accepts the leaderstats progress path the platform already accepts", () => {
    // `getPlayableLuaIssues` treats a server leaderstats IntValue plus a client
    // `.Changed` connection as a valid progress path. Recognising only remotes
    // would report every progress claim unsupported for a package the platform
    // itself considers playable.
    const leaderstats: PlayableLuaScript[] = [
      {
        path: "ServerScriptService/Score.server.lua",
        content: `local Players = game:GetService("Players")
Players.PlayerAdded:Connect(function(player)
  local stats = Instance.new("Folder")
  stats.Name = "leaderstats"
  stats.Parent = player
  local score = Instance.new("IntValue")
  score.Name = "Score"
  score.Parent = stats
end)
`,
      },
      {
        path: "StarterPlayerScripts/Hud.client.lua",
        content: `local Players = game:GetService("Players")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Parent = playerGui
local stats = Players.LocalPlayer:WaitForChild("leaderstats")
stats:WaitForChild("Score").Changed:Connect(function(value)
  gui.Name = tostring(value)
end)
`,
      },
    ];

    const result = crossValidateWorld(
      buildWorldModel(racingSources()),
      leaderstats,
    );

    expect(
      result.claims.find((claim) => claim.claimId === "condition-winCondition")
        ?.status,
    ).toBe("supported");
  });
});

describe("WORLD-1A validation evidence", () => {
  it("records an unsupported claim as advisory, never blocking", () => {
    const report = buildGenerationValidationReport({
      luaPresent: true,
      luaIssues: [],
      ui: { status: "built" },
      world: crossValidateWorld(buildWorldModel(racingSources()), luaPackage()),
    });

    const check = report.checks.find(
      (entry) => entry.id === "world-claims-supported",
    );
    expect(check?.status).toBe("failed");
    expect(check?.enforcement).toBe("advisory");
    expect(report.blockingFailures).toBe(0);
    expect(report.passed).toBe(true);
  });

  it("says the comparison did not run rather than reporting agreement", () => {
    const report = buildGenerationValidationReport({
      luaPresent: false,
      ui: { status: "not-attempted" },
    });

    expect(
      report.checks.find((entry) => entry.id === "world-claims-supported")
        ?.status,
    ).toBe("not-applicable");
  });
});

describe("WORLD-1A pipeline wiring", () => {
  it("keeps the world model non-canonical and agentless", () => {
    expect(STAGE_ORDER).toContain("WORLD_MODEL");
    // No agent produces it: it is derived from claims other stages made.
    expect(STAGE_AGENT_MAP.WORLD_MODEL).toBeNull();
  });

  it("builds a real model in the v2 pipeline instead of a passthrough", async () => {
    // Regression, and the third time this shape has appeared: an agentless
    // stage falls through to the generic passthrough, persisting
    // `{ _passthrough: true }` under a name that claims to describe a world.
    const executor = new PipelineExecutor();
    const context = executor.getContext();
    const sessionId = context.createSession("v2-world", {});
    context.recordAgentOutput(
      sessionId,
      "roblox_architect",
      racingSources().architecture as Record<string, unknown>,
    );

    const state = createPipelineState("v2-world");
    const stage = state.stages.find((entry) => entry.name === "WORLD_MODEL");

    const output = await (
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
      () => Promise.reject(new Error("no agent may run for WORLD_MODEL")),
      state,
    );

    expect(output._passthrough).toBeUndefined();
    expect(output.schemaVersion).toBe(WORLD_MODEL_SCHEMA_VERSION);
    expect(
      (output.systems as WorldModel["systems"]).some(
        (system) => system.role === "player-entry",
      ),
    ).toBe(true);
  });

  it("records the model and its cross-artifact evidence together", async () => {
    const store = new ArtifactStore();
    const recorder = new GenerationArtifactRecorder(store);
    const sources = racingSources();

    const recorded = await recorder.record("world-exec", [
      node("game_designer", sources.gameDesign as Record<string, unknown>),
      node("roblox_architect", sources.architecture as Record<string, unknown>),
      node("lua_generator", { scripts: luaPackage() }),
    ]);

    const worldArtifact = recorded.find(
      (artifact) => artifact.stage === "WORLD_MODEL",
    );
    expect(worldArtifact?.name).toBe("worldModel.json");
    expect(worldArtifact?.agent).toBeNull();

    const validation = recorded.find(
      (artifact) => artifact.stage === "VALIDATION",
    );
    const check = (
      validation?.content as {
        checks: Array<{ id: string; status: string; details: string[] }>;
      }
    ).checks.find((entry) => entry.id === "world-claims-supported");

    // The claim the code does not implement is named in durable evidence.
    expect(check?.status).toBe("failed");
    expect(check?.details.join(" ")).toContain("service-dataservice");
  });
});
