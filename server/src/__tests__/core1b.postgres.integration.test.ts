import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AuthService } from "../platform/auth/AuthService";
import { PostgresStorageProvider } from "../platform/storage/postgres/PostgresStorageProvider";
import { runMigrations } from "../platform/storage/postgres/migrationRunner";
import { ArtifactStore } from "../pipeline/v2/ArtifactStore";
import { StorageBlueprintRepository } from "../projects/repository/storageBlueprint.repository";
import type {
  CreateBlueprintInput,
  GenerationExecution,
} from "../projects/types/blueprint";
import { createProjectRuntime } from "../routes/projects";
import { ChatPersistenceService } from "../services/ChatPersistenceService";
import { ProjectSyncManager } from "../studio/v2/sync/ProjectSyncManager";
import { StorageAutonomousSessionStore } from "../platform/storage/OperationalStoreComposition";
import { createAutonomousPhaseContext } from "../orchestrator/AutonomousPhaseRegistry";
import type { AutonomousSessionRecord } from "../orchestrator/store/AutonomousSessionStore";

const describePostgres =
  process.env.RUN_POSTGRES_E2E === "true" ? describe : describe.skip;

function request(token: string): Request {
  return {
    headers: { authorization: `Bearer ${token}` },
  } as Request;
}

function response() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { response: { status, json } as unknown as Response, status, json };
}

function createBlueprintInput(projectId: string): CreateBlueprintInput {
  return {
    project_id: projectId,
    user_id: "ignored-by-repository",
    name: "PostgreSQL Restart Adventure",
    description: "Runtime state verified across provider reconstruction.",
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

function createAutonomousRecord(
  sessionId: string,
  projectId: string,
): AutonomousSessionRecord {
  const prompt = "Build a restart-safe autonomous adventure";
  return {
    session: {
      id: sessionId,
      projectId,
      prompt,
      executionMode: "bounded",
      resultAuthority: "preview-only",
      status: "running",
      currentPhase: "blueprint",
      phases: [
        {
          id: "node-blueprint",
          phase: "blueprint",
          status: "running",
          startedAt: 100,
        },
      ],
      goals: {
        targetScore: 80,
        budget: 10000,
        timeLimitMs: 300000,
        maxCost: 1,
        maxRepairIterations: 3,
      },
      cost: {
        totalTokens: 12,
        totalCost: 0.25,
        totalTimeMs: 42,
        source: "measured",
        perPhase: {},
      },
      checkpoints: [
        {
          id: `${sessionId}:checkpoint:1`,
          phase: "knowledge_search",
          timestamp: 90,
          snapshot: { durable: true },
        },
      ],
      qualityScore: 75,
      startedAt: 50,
      recoveryCount: 0,
      executionGeneration: 0,
    },
    context: createAutonomousPhaseContext(projectId, prompt),
    checkpointSequence: 1,
  };
}

describePostgres("CORE-1b PostgreSQL restart acceptance", () => {
  let activeProvider: PostgresStorageProvider | null = null;

  afterEach(async () => {
    if (activeProvider) {
      await activeProvider.close();
      activeProvider = null;
    }
  });

  it("restores projects and operational state, including autonomous interruption", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for the PostgreSQL E2E test");
    }

    await runMigrations();

    const firstProvider = new PostgresStorageProvider({
      connectionString: databaseUrl,
      strict: true,
    });
    activeProvider = firstProvider;
    await firstProvider.ready();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ownerId = `owner-${suffix}`;
    const otherId = `other-${suffix}`;
    const authBeforeRestart = new AuthService(firstProvider);
    expect(
      await authBeforeRestart.registerDurable(
        `owner-${suffix}@example.com`,
        "password123",
        ownerId,
      ),
    ).toBe(true);
    expect(
      await authBeforeRestart.registerDurable(
        `other-${suffix}@example.com`,
        "password123",
        otherId,
      ),
    ).toBe(true);
    const ownerLogin = await authBeforeRestart.loginDurable(
      `owner-${suffix}@example.com`,
      "password123",
      ownerId,
    );
    if (!ownerLogin.token) {
      throw new Error("Owner login did not return an access token");
    }
    const ownerToken = ownerLogin.token;

    const otherLogin = await authBeforeRestart.loginDurable(
      `other-${suffix}@example.com`,
      "password123",
      otherId,
    );
    if (!otherLogin.token) {
      throw new Error("Other-user login did not return an access token");
    }
    const otherToken = otherLogin.token;

    const runtimeBeforeRestart = createProjectRuntime(
      firstProvider,
      authBeforeRestart,
    );
    const project = await runtimeBeforeRestart.projectRepository.createDurable(
      ownerId,
      "Durable Project",
      "adventure",
    );

    const blueprintsBeforeRestart = new StorageBlueprintRepository(
      firstProvider,
    );
    const blueprint = await blueprintsBeforeRestart.createBlueprint(
      ownerId,
      createBlueprintInput(project.id),
    );
    await blueprintsBeforeRestart.saveVersion(
      blueprint.id,
      ownerId,
      "Restart checkpoint",
    );
    const execution: GenerationExecution = {
      id: `execution-${suffix}`,
      blueprint_id: blueprint.id,
      project_id: project.id,
      user_id: ownerId,
      started_at: new Date("2026-07-24T14:00:00.000Z"),
      completed_at: new Date("2026-07-24T14:00:10.000Z"),
      status: "completed",
      pipeline_steps: [
        {
          agent: "roblox_architect",
          status: "completed",
          started_at: new Date("2026-07-24T14:00:00.000Z"),
          completed_at: new Date("2026-07-24T14:00:10.000Z"),
          duration_ms: 10000,
        },
      ],
      total_duration_ms: 10000,
      retry_count: 0,
    };
    await blueprintsBeforeRestart.recordExecution(execution);

    const artifactsBeforeRestart = new ArtifactStore(firstProvider);
    const luaArtifact = artifactsBeforeRestart.store(
      execution.id,
      "LUA_GENERATION",
      "lua_generator",
      {
        scripts: [
          {
            path: "ServerScriptService/Main.server.lua",
            content: "return { durable = true }",
          },
        ],
      },
    );

    const chatBeforeRestart = new ChatPersistenceService(firstProvider);
    const firstMessage = await chatBeforeRestart.createMessage({
      projectId: project.id,
      role: "user",
      content: "Keep this conversation after PostgreSQL reconnects.",
    });
    await chatBeforeRestart.createMessage({
      conversationId: firstMessage.conversationId,
      role: "assistant",
      content: "Persistence checkpoint recorded.",
    });

    const autonomousSessionId = `autonomous-${suffix}`;
    const autonomousBeforeRestart = new StorageAutonomousSessionStore(
      firstProvider,
    );
    await autonomousBeforeRestart.save(
      createAutonomousRecord(autonomousSessionId, project.id),
    );

    await firstProvider.flush();
    await firstProvider.close();
    activeProvider = null;

    const secondProvider = new PostgresStorageProvider({
      connectionString: databaseUrl,
      strict: true,
    });
    activeProvider = secondProvider;
    await secondProvider.ready();

    const authAfterRestart = new AuthService(secondProvider);
    const runtimeAfterRestart = createProjectRuntime(
      secondProvider,
      authAfterRestart,
    );
    const blueprintsAfterRestart = new StorageBlueprintRepository(
      secondProvider,
    );
    const artifactsAfterRestart = new ArtifactStore(secondProvider);
    const chatAfterRestart = new ChatPersistenceService(secondProvider);
    const autonomousAfterRestart = new StorageAutonomousSessionStore(
      secondProvider,
    );

    await expect(autonomousAfterRestart.markInterrupted()).resolves.toBe(1);
    await expect(autonomousAfterRestart.markInterrupted()).resolves.toBe(0);
    expect(autonomousAfterRestart.get(autonomousSessionId)).toMatchObject({
      checkpointSequence: 1,
      session: {
        projectId: project.id,
        status: "paused",
        currentPhase: "paused",
        restartInterruptedAt: 100,
        recoveryReason: "server_restart",
        cost: { totalCost: 0.25 },
        checkpoints: [{ id: `${autonomousSessionId}:checkpoint:1` }],
      },
    });

    expect((await authAfterRestart.validateToken(ownerToken))?.userId).toBe(
      ownerId,
    );
    expect(runtimeAfterRestart.projectRepository.get(project.id)?.ownerId).toBe(
      ownerId,
    );
    expect(
      (await blueprintsAfterRestart.getBlueprint(blueprint.id))?.project_id,
    ).toBe(project.id);
    expect(
      await blueprintsAfterRestart.listVersions(blueprint.id),
    ).toHaveLength(1);
    expect(
      (await blueprintsAfterRestart.getExecution(execution.id))?.started_at,
    ).toBeInstanceOf(Date);
    expect(artifactsAfterRestart.getById(luaArtifact.id)?.content).toEqual(
      luaArtifact.content,
    );
    expect(
      new ProjectSyncManager(artifactsAfterRestart).getProjectSnapshot(
        execution.id,
      )?.artifactCount,
    ).toBe(1);
    expect(
      chatAfterRestart.getConversation(firstMessage.conversationId)?.messages,
    ).toHaveLength(2);

    const ownerResponse = response();
    expect(
      await runtimeAfterRestart.access.requireProjectAccess(
        request(ownerToken),
        ownerResponse.response,
        project.id,
      ),
    ).toBe(true);

    const foreignResponse = response();
    expect(
      await runtimeAfterRestart.access.requireProjectAccess(
        request(otherToken),
        foreignResponse.response,
        project.id,
      ),
    ).toBe(false);
    expect(foreignResponse.status).toHaveBeenCalledWith(403);
  });
});
