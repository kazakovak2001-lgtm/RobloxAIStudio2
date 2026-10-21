import { describe, expect, it } from "vitest";

import {
  getPlayableLuaIssues,
  assertPlayableLuaScripts,
  type PlayableLuaScript,
} from "../types/playableLua";
import {
  crossValidateWorld,
  WORLD_CROSS_ANALYSIS_MODE,
} from "../validation/worldCrossValidation";
import {
  WORLD_MODEL_SCHEMA_VERSION,
  type WorldModel,
} from "../validation/worldModel";
import { ArtifactStore, type PipelineArtifact } from "../pipeline/v2";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import type { TaskNode } from "../planning/model/TaskGraph";

/**
 * WORLD-1C-SLICE-2. `getPlayableLuaIssues` and `crossValidateWorld` become
 * mode-aware without moving ownership: for `lua-owned` every existing
 * assertion is preserved exactly, and `materialized-world` gets new binding
 * evidence in its place, never a relaxation of the `lua-owned` gate. Nothing
 * here makes any producer emit `materialized-world` — see
 * `docs/00-project-control/WORLD-1C_SCOPE.md`.
 */

const PROJECT_ID = "world1c-slice2-project";

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

// A minimal world model naming a single `player-entry` claim, the one role
// whose cross-validation evidence actually changes under WORLD-1C.
function playerEntryWorld(): WorldModel {
  return {
    schemaVersion: WORLD_MODEL_SCHEMA_VERSION,
    systems: [
      {
        id: "service-spawnservice",
        role: "player-entry",
        title: "SpawnService: places racers on the grid",
        source: "architecture",
      },
    ],
    entities: [],
    relationships: [],
    constraints: [],
    dependencies: [],
    limits: [],
  };
}

function serverScript(content: string): PlayableLuaScript[] {
  return [{ path: "ServerScriptService/Entry.server.lua", content }];
}

describe("WORLD-1C — unknown world runtime mode fails closed", () => {
  it("getPlayableLuaIssues throws on an unrecognized mode", () => {
    expect(() => getPlayableLuaIssues([], "workspace-owned" as never)).toThrow(
      /Unknown world runtime mode/,
    );
  });

  it("assertPlayableLuaScripts throws on an unrecognized mode", () => {
    expect(() =>
      assertPlayableLuaScripts([], "workspace-owned" as never),
    ).toThrow(/Unknown world runtime mode/);
  });

  it("crossValidateWorld throws on an unrecognized mode", () => {
    expect(() =>
      crossValidateWorld(playerEntryWorld(), [], "workspace-owned" as never),
    ).toThrow(/Unknown world runtime mode/);
  });
});

describe("WORLD-1C — crossValidateWorld reports separate evidence classes per mode", () => {
  // Constructs the entry point with `Instance.new`, exactly what
  // `lua-owned` evidence requires and `materialized-world` evidence does not
  // recognise (it requires a lookup call, which this script never makes).
  const CONSTRUCTION_ONLY_SERVER =
    serverScript(`local Players = game:GetService("Players")

local spawnPad = Instance.new("SpawnLocation")
spawnPad.Anchored = true
spawnPad.Parent = workspace

Players.PlayerAdded:Connect(function(player)
  player.CharacterAdded:Connect(function(character)
    character:MoveTo(spawnPad.Position)
  end)
end)
`);

  // Binds to an entry point the materializer already placed, and pivots the
  // player there — no `Instance.new`, `LoadCharacter`, `MoveTo` or `CFrame=`
  // anywhere, so none of `lua-owned`'s evidence patterns are present either.
  const BINDING_ONLY_SERVER =
    serverScript(`local Players = game:GetService("Players")

local spawnPad = workspace:WaitForChild("SpawnPad")

Players.PlayerAdded:Connect(function(player)
  player.CharacterAdded:Connect(function(character)
    character:PivotTo(spawnPad:GetPivot())
  end)
end)
`);

  it("supports the player-entry claim under lua-owned only when Lua constructs it", () => {
    const luaOwned = crossValidateWorld(
      playerEntryWorld(),
      CONSTRUCTION_ONLY_SERVER,
      "lua-owned",
    );
    const materialized = crossValidateWorld(
      playerEntryWorld(),
      CONSTRUCTION_ONLY_SERVER,
      "materialized-world",
    );

    expect(
      luaOwned.claims.find((c) => c.claimId === "service-spawnservice")?.status,
    ).toBe("supported");
    expect(
      materialized.claims.find((c) => c.claimId === "service-spawnservice")
        ?.status,
    ).toBe("unsupported");
  });

  it("supports the player-entry claim under materialized-world only when Lua binds to it", () => {
    const luaOwned = crossValidateWorld(
      playerEntryWorld(),
      BINDING_ONLY_SERVER,
      "lua-owned",
    );
    const materialized = crossValidateWorld(
      playerEntryWorld(),
      BINDING_ONLY_SERVER,
      "materialized-world",
    );

    expect(
      luaOwned.claims.find((c) => c.claimId === "service-spawnservice")?.status,
    ).toBe("unsupported");
    expect(
      materialized.claims.find((c) => c.claimId === "service-spawnservice")
        ?.status,
    ).toBe("supported");
  });

  it("records which evidence class produced the result, and defaults to lua-owned", () => {
    const defaulted = crossValidateWorld(playerEntryWorld(), []);
    const explicitLuaOwned = crossValidateWorld(
      playerEntryWorld(),
      [],
      "lua-owned",
    );
    const materialized = crossValidateWorld(
      playerEntryWorld(),
      [],
      "materialized-world",
    );

    expect(defaulted.analysisMode).toBe(WORLD_CROSS_ANALYSIS_MODE);
    expect(defaulted).toEqual(explicitLuaOwned);
    expect(materialized.analysisMode).toBe("deterministic-binding-pattern");
    expect(materialized.analysisMode).not.toBe(defaulted.analysisMode);
  });

  it("keeps every other role's evidence identical across modes", () => {
    // interactive-entity, progress-signal, presentation, persistence,
    // server-authority and descriptive are not world-ownership claims per
    // WORLD-1C_SCOPE.md, so their evidence functions must be the exact same
    // object under both modes — not two copies that happen to agree today.
    const world: WorldModel = {
      schemaVersion: WORLD_MODEL_SCHEMA_VERSION,
      systems: [
        {
          id: "service-dataservice",
          role: "persistence",
          title: "DataService: persists best lap times",
          source: "architecture",
        },
        {
          id: "condition-winCondition",
          role: "progress-signal",
          title: "Cross the finish line first",
          source: "game-design",
        },
        {
          id: "presentation",
          role: "presentation",
          title: "The client presents world state to the player",
          source: "blueprint",
        },
      ],
      entities: [
        {
          id: "mechanic-1",
          role: "interactive-entity",
          title: "drifting",
          source: "game-design",
        },
      ],
      relationships: [],
      constraints: [],
      dependencies: [],
      limits: [],
    };

    const luaOwned = crossValidateWorld(world, [], "lua-owned");
    const materialized = crossValidateWorld(world, [], "materialized-world");

    for (const claimId of [
      "service-dataservice",
      "condition-winCondition",
      "presentation",
      "mechanic-1",
    ]) {
      expect(
        luaOwned.claims.find((c) => c.claimId === claimId)?.expectation,
      ).toBe(
        materialized.claims.find((c) => c.claimId === claimId)?.expectation,
      );
    }
  });
});

describe("WORLD-1C — getPlayableLuaIssues mode-aware world-ownership rules", () => {
  it("requires Lua to construct the world under lua-owned, unchanged from before", () => {
    const boundOnly = serverScript(
      `local part = workspace:WaitForChild("ExistingPart")\nprint(part)\n`,
    );
    expect(getPlayableLuaIssues(boundOnly)).toContain(
      "server code must create playable world instances",
    );
    expect(getPlayableLuaIssues(boundOnly, "lua-owned")).toContain(
      "server code must create playable world instances",
    );
  });

  it("requires Lua to bind to the world under materialized-world instead of constructing it", () => {
    const constructedOnly = serverScript(
      `local part = Instance.new("Part")\npart.Parent = workspace\n`,
    );

    const luaOwnedIssues = getPlayableLuaIssues(constructedOnly, "lua-owned");
    const materializedIssues = getPlayableLuaIssues(
      constructedOnly,
      "materialized-world",
    );

    expect(luaOwnedIssues).not.toContain(
      "server code must create playable world instances",
    );
    expect(materializedIssues).toContain(
      "server code must bind to the materialized world instead of constructing it",
    );
    expect(materializedIssues).toContain(
      "server code must not construct new instances directly under Workspace when the world is materialized",
    );
  });

  it("accepts a binding-only world reference under materialized-world", () => {
    const boundOnly = serverScript(
      `local part = workspace:WaitForChild("ExistingPart")\nprint(part)\n`,
    );
    const issues = getPlayableLuaIssues(boundOnly, "materialized-world");
    expect(issues).not.toContain(
      "server code must bind to the materialized world instead of constructing it",
    );
    expect(issues).not.toContain(
      "server code must not construct new instances directly under Workspace when the world is materialized",
    );
  });

  it("keeps the gameplay-interaction rule identical text and evidence in both modes", () => {
    const noInteraction = serverScript(
      `local part = Instance.new("Part")\npart.Parent = workspace\n`,
    );
    expect(getPlayableLuaIssues(noInteraction, "lua-owned")).toContain(
      "server code must implement a gameplay interaction",
    );
    expect(getPlayableLuaIssues(noInteraction, "materialized-world")).toContain(
      "server code must implement a gameplay interaction",
    );
  });
});

describe("WORLD-1C — legacy execution / rollback resolves historical lua-owned behaviour", () => {
  const design = {
    gameplay: {
      mechanics: [{ name: "collect" }],
      balance: { winCondition: "Collect them all" },
    },
  };
  const architecture = {
    architecture: { services: { SpawnService: "spawns" } },
  };

  const SERVER = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progress = Instance.new("RemoteEvent")
progress.Name = "OrbProgress"
progress.Parent = ReplicatedStorage

local arena = Instance.new("Folder")
arena.Name = "GeneratedArena"
arena.Parent = workspace

local spawnPad = Instance.new("SpawnLocation")
spawnPad.Anchored = true
spawnPad.Parent = arena

local orb = Instance.new("Part")
orb.Name = "Orb1"
orb.Anchored = true
orb.Parent = arena

orb.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if not player then
    return
  end
  progress:FireAllClients(1, 1)
end)

Players.PlayerAdded:Connect(function(player)
  local stats = Instance.new("Folder")
  stats.Name = "leaderstats"
  stats.Parent = player
end)
`;

  const CLIENT = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Name = "OrbHud"
gui.Parent = playerGui

ReplicatedStorage:WaitForChild("OrbProgress").OnClientEvent:Connect(function(score, goal)
  print(score, goal)
end)
`;

  function nodes(): TaskNode[] {
    return [
      node("game_designer", design),
      node("roblox_architect", architecture),
      node("lua_generator", {
        scripts: [
          { path: "ServerScriptService/Orb.server.lua", content: SERVER },
          { path: "StarterPlayerScripts/Hud.client.lua", content: CLIENT },
        ],
      }),
    ];
  }

  function validationContent(recorded: PipelineArtifact[]): unknown {
    return recorded.find((artifact) => artifact.stage === "VALIDATION")
      ?.content;
  }

  it("produces the same validation report whether the mode is omitted or explicitly lua-owned", async () => {
    const defaultedStore = new ArtifactStore(new InMemoryStorageProvider());
    const defaulted = await new GenerationArtifactRecorder(
      defaultedStore,
    ).record("exec-defaulted", nodes(), PROJECT_ID, {});

    const explicitStore = new ArtifactStore(new InMemoryStorageProvider());
    const explicit = await new GenerationArtifactRecorder(explicitStore).record(
      "exec-explicit",
      nodes(),
      PROJECT_ID,
      {
        worldRuntimeMode: "lua-owned",
      },
    );

    expect(validationContent(defaulted)).toEqual(validationContent(explicit));
    expect(
      (validationContent(defaulted) as { worldRuntimeMode?: string })
        .worldRuntimeMode,
    ).toBe("lua-owned");
  });
});
