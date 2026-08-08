import { describe, expect, it, vi } from "vitest";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../../projects/repository/blueprint.repository";
import { ArtifactStore } from "../../pipeline/v2";
import { getPlayableLuaIssues } from "../../types/playableLua";
import { RepairEngine } from "../RepairEngine";
import { InMemoryRepairSessionStore } from "../RepairSessionStore";

const PROJECT_ID = "repair-engine-test-project";
const PARENT_EXECUTION_ID = "repair-engine-test-exec";

const BROKEN_SCRIPTS = [
  {
    path: "ServerScriptService/World.server.lua",
    content:
      "local world = workspace:FindFirstChild('World') or Instance.new('Folder')\nworld.Name = 'World'\nworld.Parent = workspace",
  },
  {
    path: "StarterPlayerScripts/HUD.client.lua",
    content:
      "local Players = game:GetService('Players')\nlocal gui = Instance.new('ScreenGui')\ngui.Parent = Players.LocalPlayer:WaitForChild('PlayerGui')",
  },
];

async function seedBlueprint(
  repository: InMemoryBlueprintRepository,
): Promise<void> {
  await repository.createBlueprint("repair-engine-test-user", {
    project_id: PROJECT_ID,
    user_id: "repair-engine-test-user",
    name: "Repair Engine Test Game",
    description: "A blueprint used only to exercise RepairEngine.",
    game_type: "rpg",
    genre: ["rpg"],
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
}

describe("RepairEngine", () => {
  it("repairs a broken execution into a new, playable, immutable execution", async () => {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");

    // Deterministic fallback content is guaranteed playable — use it as the
    // mocked LLM's response so the repair attempt succeeds without a live
    // provider.
    const playable = await luaAgent.execute({
      blueprint: { name: "Repair Engine Test Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });

    const blueprintRepository = new InMemoryBlueprintRepository();
    await seedBlueprint(blueprintRepository);

    const artifactStore = new ArtifactStore();
    await artifactStore.store(
      PARENT_EXECUTION_ID,
      "LUA_GENERATION",
      "lua_generator",
      { scripts: BROKEN_SCRIPTS },
    );
    await artifactStore.store(
      PARENT_EXECUTION_ID,
      "ARCHITECTURE",
      "roblox_architect",
      { services: ["WorldService"] },
    );

    const engine = new RepairEngine(
      registry,
      blueprintRepository,
      artifactStore,
      new InMemoryRepairSessionStore(),
    );

    const session = await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });

    expect(session.status).not.toBe("running");
    expect(session.totalRepairs).toBeGreaterThan(0);
    expect(session.history).toHaveLength(1);

    const record = session.history[0];
    expect(record.newExecutionId).toBeDefined();
    expect(record.parentExecutionId).toBe(PARENT_EXECUTION_ID);

    // The new execution's Lua artifact must independently pass the
    // playability contract.
    const newArtifacts = artifactStore.getByPipeline(record.newExecutionId!);
    const newLua = newArtifacts.find((a) => a.stage === "LUA_GENERATION");
    expect(newLua).toBeDefined();
    const newScripts = (newLua!.content as { scripts: typeof BROKEN_SCRIPTS })
      .scripts;
    expect(getPlayableLuaIssues(newScripts)).toEqual([]);

    // Other stages were copied forward unchanged.
    const newArchitecture = newArtifacts.find(
      (a) => a.stage === "ARCHITECTURE",
    );
    expect(newArchitecture?.content).toEqual({ services: ["WorldService"] });

    // The parent execution's own artifacts are byte-for-byte unchanged.
    const parentArtifactsAfter =
      artifactStore.getByPipeline(PARENT_EXECUTION_ID);
    const parentLuaAfter = parentArtifactsAfter.find(
      (a) => a.stage === "LUA_GENERATION",
    );
    expect(parentLuaAfter?.content).toEqual({ scripts: BROKEN_SCRIPTS });

    // Session state is durably readable back out.
    const reloaded = await engine.getSession(PROJECT_ID);
    expect(reloaded?.status).toBe(session.status);
    const history = await engine.getHistory(PROJECT_ID);
    expect(history).toHaveLength(1);
  });

  it("fails closed and persists nothing new when the agent cannot produce a playable result", async () => {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");
    luaAgent.setLLM({
      generate: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });

    const blueprintRepository = new InMemoryBlueprintRepository();
    await seedBlueprint(blueprintRepository);

    const artifactStore = new ArtifactStore();
    await artifactStore.store(
      PARENT_EXECUTION_ID,
      "LUA_GENERATION",
      "lua_generator",
      { scripts: BROKEN_SCRIPTS },
    );

    const engine = new RepairEngine(
      registry,
      blueprintRepository,
      artifactStore,
      new InMemoryRepairSessionStore(),
    );

    const session = await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });

    expect(session.totalRepairs).toBe(0);
    expect(session.history[0]?.newExecutionId).toBeUndefined();

    // Nothing was ever stored under a derived execution id.
    const derived = artifactStore.getByPipeline(
      `${PARENT_EXECUTION_ID}-repair-1`,
    );
    expect(derived).toEqual([]);
  });
});
