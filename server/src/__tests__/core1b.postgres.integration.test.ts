import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AuthService } from "../platform/auth/AuthService";
import { PostgresStorageProvider } from "../platform/storage/postgres/PostgresStorageProvider";
import { runMigrations } from "../platform/storage/postgres/migrationRunner";
import { StorageBlueprintRepository } from "../projects/repository/storageBlueprint.repository";
import type {
  CreateBlueprintInput,
  GenerationExecution,
} from "../projects/types/blueprint";
import { createProjectRuntime } from "../routes/projects";
import { ChatPersistenceService } from "../services/ChatPersistenceService";

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

describePostgres("CORE-1b PostgreSQL restart acceptance", () => {
  let activeProvider: PostgresStorageProvider | null = null;

  afterEach(async () => {
    if (activeProvider) {
      await activeProvider.close();
      activeProvider = null;
    }
  });

  it("restores owned projects, blueprints, executions, chat, and sessions", async () => {
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
      authBeforeRestart.register(
        `owner-${suffix}@example.com`,
        "password123",
        ownerId,
      ),
    ).toBe(true);
    expect(
      authBeforeRestart.register(
        `other-${suffix}@example.com`,
        "password123",
        otherId,
      ),
    ).toBe(true);
    const ownerToken = authBeforeRestart.login(
      `owner-${suffix}@example.com`,
      "password123",
      ownerId,
    ).token!;
    const otherToken = authBeforeRestart.login(
      `other-${suffix}@example.com`,
      "password123",
      otherId,
    ).token!;

    const runtimeBeforeRestart = createProjectRuntime(
      firstProvider,
      authBeforeRestart,
    );
    const project = runtimeBeforeRestart.projectRepository.create(
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

    const chatBeforeRestart = new ChatPersistenceService(firstProvider);
    const firstMessage = chatBeforeRestart.createMessage({
      projectId: project.id,
      role: "user",
      content: "Keep this conversation after PostgreSQL reconnects.",
    });
    chatBeforeRestart.createMessage({
      conversationId: firstMessage.conversationId,
      role: "assistant",
      content: "Persistence checkpoint recorded.",
    });

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
    const chatAfterRestart = new ChatPersistenceService(secondProvider);

    expect(authAfterRestart.validateToken(ownerToken)?.userId).toBe(ownerId);
    expect(runtimeAfterRestart.projectRepository.get(project.id)?.ownerId).toBe(
      ownerId,
    );
    expect(
      (await blueprintsAfterRestart.getBlueprint(blueprint.id))?.project_id,
    ).toBe(project.id);
    expect(await blueprintsAfterRestart.listVersions(blueprint.id)).toHaveLength(
      1,
    );
    expect(
      (await blueprintsAfterRestart.getExecution(execution.id))?.started_at,
    ).toBeInstanceOf(Date);
    expect(
      chatAfterRestart.getConversation(firstMessage.conversationId)?.messages,
    ).toHaveLength(2);

    const ownerResponse = response();
    expect(
      runtimeAfterRestart.access.requireProjectAccess(
        request(ownerToken),
        ownerResponse.response,
        project.id,
      ),
    ).toBe(true);

    const foreignResponse = response();
    expect(
      runtimeAfterRestart.access.requireProjectAccess(
        request(otherToken),
        foreignResponse.response,
        project.id,
      ),
    ).toBe(false);
    expect(foreignResponse.status).toHaveBeenCalledWith(403);
  });
});
