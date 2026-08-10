import { describe, expect, it, vi } from "vitest";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../../projects/repository/blueprint.repository";
import { ArtifactStore } from "../../pipeline/v2";
import { getPlayableLuaIssues } from "../../types/playableLua";
import { RepairEngine } from "../RepairEngine";
import { InMemoryRepairSessionStore } from "../RepairSessionStore";

/** ARTIFACT-CONTRACT-2 requires an owning project on every new artifact. */
const ARTIFACT_TEST_PROJECT = "repair-engine-test-project";

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
      { projectId: ARTIFACT_TEST_PROJECT },
    );
    await artifactStore.store(
      PARENT_EXECUTION_ID,
      "ARCHITECTURE",
      "roblox_architect",
      { services: ["WorldService"] },
      { projectId: ARTIFACT_TEST_PROJECT },
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
      { projectId: ARTIFACT_TEST_PROJECT },
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

  it("keeps an earlier successful repair discoverable after a later run() call", async () => {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");

    const playable = await luaAgent.execute({
      blueprint: { name: "Repair Engine Test Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });

    const blueprintRepository = new InMemoryBlueprintRepository();
    await seedBlueprint(blueprintRepository);

    const artifactStore = new ArtifactStore();
    await artifactStore.store(
      PARENT_EXECUTION_ID,
      "LUA_GENERATION",
      "lua_generator",
      { scripts: BROKEN_SCRIPTS },
      { projectId: ARTIFACT_TEST_PROJECT },
    );

    const sessionStore = new InMemoryRepairSessionStore();
    const engine = new RepairEngine(
      registry,
      blueprintRepository,
      artifactStore,
      sessionStore,
    );

    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });
    const firstSession = await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });
    const firstNewExecutionId = firstSession.history[0]?.newExecutionId;
    expect(firstNewExecutionId).toBeDefined();

    // A second run() call for the same project — e.g. a retry against the
    // still-broken parent — must not discard the first call's history.
    luaAgent.setLLM({
      generate: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });
    const secondSession = await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });

    expect(secondSession.history).toHaveLength(2);
    expect(secondSession.history[0]?.newExecutionId).toBe(firstNewExecutionId);
    expect(secondSession.history[1]?.newExecutionId).toBeUndefined();

    const reloaded = await engine.getSession(PROJECT_ID);
    expect(reloaded?.history).toHaveLength(2);
    expect(reloaded?.history[0]?.newExecutionId).toBe(firstNewExecutionId);

    // The first repair's artifacts are still durably intact.
    const firstArtifacts = artifactStore.getByPipeline(firstNewExecutionId!);
    expect(firstArtifacts.length).toBeGreaterThan(0);
  });

  it("assigns distinct execution ids to two successful repairs of the same parent", async () => {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");

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
      { projectId: ARTIFACT_TEST_PROJECT },
    );

    const engine = new RepairEngine(
      registry,
      blueprintRepository,
      artifactStore,
      new InMemoryRepairSessionStore(),
    );

    const first = await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });
    const second = await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });

    const firstId = first.history[0]?.newExecutionId;
    const secondId = second.history[1]?.newExecutionId;
    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();
    expect(secondId).not.toBe(firstId);

    // Each repair's artifacts must live under its own execution id, not be
    // mixed into one pipeline id by a collided suffix. Each carries the
    // repaired Lua and the security review re-derived from it.
    for (const executionId of [firstId!, secondId!]) {
      const stages = artifactStore
        .getByPipeline(executionId)
        .map((artifact) => artifact.stage)
        .sort();
      expect(stages).toEqual(["LUA_GENERATION", "SECURITY_REVIEW"]);
    }
  });

  it("preserves both repair records when two run() calls race for the same project", async () => {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");

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
      { projectId: ARTIFACT_TEST_PROJECT },
    );

    const engine = new RepairEngine(
      registry,
      blueprintRepository,
      artifactStore,
      new InMemoryRepairSessionStore(),
    );

    // Two concurrent run() calls for the same project — without
    // serialization, the second call's save() could overwrite the first
    // call's history before it's read.
    const [first, second] = await Promise.all([
      engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
        maxIterations: 1,
        targetScore: 95,
      }),
      engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
        maxIterations: 1,
        targetScore: 95,
      }),
    ]);

    expect(first.history[0]?.newExecutionId).toBeDefined();
    expect(second.history.at(-1)?.newExecutionId).toBeDefined();

    const finalSession = await engine.getSession(PROJECT_ID);
    expect(finalSession?.history).toHaveLength(2);
    const executionIds = finalSession?.history.map((r) => r.newExecutionId);
    expect(new Set(executionIds).size).toBe(2);
  });

  it("carries the delivery audit trail forward across later run() calls", async () => {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");

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
      { projectId: ARTIFACT_TEST_PROJECT },
    );

    const engine = new RepairEngine(
      registry,
      blueprintRepository,
      artifactStore,
      new InMemoryRepairSessionStore(),
    );

    await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });
    await engine.recordDelivery(PROJECT_ID, {
      timestamp: 1,
      executionId: `${PARENT_EXECUTION_ID}-repair-1`,
      studioId: "studio-1",
      source: "latest-repair",
      success: true,
    });

    // A later run() call must not silently wipe the delivery audit trail —
    // the same carry-forward bug class already fixed once for history.
    await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });

    const session = await engine.getSession(PROJECT_ID);
    expect(session?.deliveries).toHaveLength(1);
    expect(session?.deliveries[0]?.studioId).toBe("studio-1");
  });

  it("does not lose a delivery record or a repair record when they race", async () => {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");

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
      { projectId: ARTIFACT_TEST_PROJECT },
    );

    const engine = new RepairEngine(
      registry,
      blueprintRepository,
      artifactStore,
      new InMemoryRepairSessionStore(),
    );

    // Seed a session so recordDelivery has something to attach to.
    await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });

    await Promise.all([
      engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
        maxIterations: 1,
        targetScore: 95,
      }),
      engine.recordDelivery(PROJECT_ID, {
        timestamp: 2,
        executionId: `${PARENT_EXECUTION_ID}-repair-1`,
        studioId: "studio-race",
        source: "latest-repair",
        success: true,
      }),
    ]);

    const session = await engine.getSession(PROJECT_ID);
    expect(session?.history).toHaveLength(2);
    expect(session?.deliveries).toHaveLength(1);
    expect(session?.deliveries[0]?.studioId).toBe("studio-race");
  });
});
