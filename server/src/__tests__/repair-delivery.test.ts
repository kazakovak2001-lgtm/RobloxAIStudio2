import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepairRouter } from "../routes/repair";
import type { ProjectAccessControl } from "../routes/projects";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { ArtifactStore } from "../pipeline/v2";
import {
  configureArtifactStorageFactory,
  type ArtifactStorageProvider,
} from "../pipeline/v2/ArtifactStore";
import { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import { resetSharedStudioRuntimeForTests } from "../studio/v2/StudioRuntime";

// StudioIntegrationManager always resolves artifacts through the
// process-wide shared StudioRuntime's own ArtifactStore instance, separate
// from any ArtifactStore constructed directly in a test. In production both
// share one durable backing via configureArtifactStorageFactory
// (wired at startup in index.ts); mirror that here so a repaired execution
// stored through the repair router is actually visible to Studio delivery.
function createInMemoryArtifactStorage(): ArtifactStorageProvider {
  const collections = new Map<string, Map<string, unknown>>();
  const collection = (name: string) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  };
  return {
    get: (name, id) => (collection(name).get(id) as never) ?? null,
    list: (name, filter) => {
      const items = Array.from(collection(name).values()) as never[];
      return filter ? items.filter(filter) : items;
    },
    count: (name) => collection(name).size,
    setDurable: async (name, id, data) => {
      collection(name).set(id, data);
    },
  };
}

// REPAIR-1B: exercises the real /run -> /deliver flow end to end. Access
// control itself is already covered by security2gE.repair-scope.test.ts
// (static ordering) and the HARDEN-2A auth-contract suite (live auth), so
// this stub always allows — what's under test here is repair-route logic,
// RepairEngine, and StudioIntegrationManager wiring, not authentication.
function allowAllAccess(): ProjectAccessControl {
  return {
    getRequestUserId: async () => "repair-delivery-test-user",
    requireAuthenticatedUser: async () => "repair-delivery-test-user",
    requireProjectAccess: async () => true,
    hasProjectAccess: async () => true,
  };
}

const PROJECT_ID = "repair-delivery-test-project";
const PARENT_EXECUTION_ID = "repair-delivery-test-exec";

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
  await repository.createBlueprint("repair-delivery-test-user", {
    project_id: PROJECT_ID,
    user_id: "repair-delivery-test-user",
    name: "Repair Delivery Test Game",
    description: "A blueprint used only to exercise the /deliver route.",
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

async function runRepair(baseUrl: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}/api/repair/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      executionId: PARENT_EXECUTION_ID,
      config: { maxIterations: 1, targetScore: 95 },
    }),
  });
  return response.json();
}

describe("REPAIR-1B delivery route", () => {
  let server: Server;
  let baseUrl: string;
  let registry: AgentRegistry;
  let studioManager: StudioIntegrationManager;

  beforeEach(async () => {
    const sharedStorage = createInMemoryArtifactStorage();
    configureArtifactStorageFactory(() => sharedStorage);

    registry = new AgentRegistry();
    const blueprintRepository = new InMemoryBlueprintRepository();
    await seedBlueprint(blueprintRepository);

    const artifactStore = new ArtifactStore();
    await artifactStore.store(
      PARENT_EXECUTION_ID,
      "LUA_GENERATION",
      "lua_generator",
      { scripts: BROKEN_SCRIPTS },
    );

    studioManager = new StudioIntegrationManager();

    const app = express();
    app.use(express.json());
    app.use(
      "/api/repair",
      createRepairRouter(
        allowAllAccess(),
        registry,
        blueprintRepository,
        studioManager,
        artifactStore,
      ),
    );

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    // StudioIntegrationManager wraps one process-wide shared StudioRuntime —
    // reset it so a connected client from one test doesn't leak into others.
    resetSharedStudioRuntimeForTests();
  });

  it("returns 404 when no repair has happened yet", async () => {
    studioManager.connect("studio-1", PROJECT_ID);

    const response = await fetch(
      `${baseUrl}/api/repair/${PROJECT_ID}/deliver`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("No repaired execution available");
  });

  it("returns 404 when no Studio session is connected", async () => {
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");
    const playable = await luaAgent.execute({
      blueprint: { name: "Repair Delivery Test Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });
    await runRepair(baseUrl);

    const response = await fetch(
      `${baseUrl}/api/repair/${PROJECT_ID}/deliver`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("No connected Studio session");
  });

  it("delivers the repaired execution id, not the parent, to a connected Studio session", async () => {
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");
    const playable = await luaAgent.execute({
      blueprint: { name: "Repair Delivery Test Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });
    const runBody = (await runRepair(baseUrl)) as {
      data: { history: Array<{ newExecutionId?: string }> };
    };
    const expectedExecutionId = runBody.data.history[0]?.newExecutionId;
    expect(expectedExecutionId).toBeDefined();
    expect(expectedExecutionId).not.toBe(PARENT_EXECUTION_ID);

    studioManager.connect("studio-1", PROJECT_ID);

    const response = await fetch(
      `${baseUrl}/api/repair/${PROJECT_ID}/deliver`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId: "studio-1" }),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: { executionId: string; syncResult: { success: boolean } };
    };
    expect(body.success).toBe(true);
    expect(body.data.executionId).toBe(expectedExecutionId);
    expect(body.data.syncResult.success).toBe(true);
  });

  it("reports failure when Studio synchronization itself fails", async () => {
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");
    const playable = await luaAgent.execute({
      blueprint: { name: "Repair Delivery Test Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });
    await runRepair(baseUrl);

    studioManager.connect("studio-1", PROJECT_ID);
    vi.spyOn(studioManager, "synchronizeExecution").mockResolvedValue({
      success: false,
      sessionId: "",
      payloadId: "",
      itemsSynced: 0,
      totalSize: 0,
      durationMs: 0,
      error: "simulated queue failure",
    });

    const response = await fetch(
      `${baseUrl}/api/repair/${PROJECT_ID}/deliver`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId: "studio-1" }),
      },
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("simulated queue failure");
  });

  it("returns a non-2xx response when Studio synchronization throws", async () => {
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");
    const playable = await luaAgent.execute({
      blueprint: { name: "Repair Delivery Test Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });
    await runRepair(baseUrl);

    studioManager.connect("studio-1", PROJECT_ID);
    vi.spyOn(studioManager, "synchronizeExecution").mockRejectedValue(
      new Error("synchronize threw"),
    );

    const response = await fetch(
      `${baseUrl}/api/repair/${PROJECT_ID}/deliver`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId: "studio-1" }),
      },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("synchronize threw");
  });
});
