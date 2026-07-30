import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../platform/storage/StorageProvider";
import {
  StorageGenerationHistoryRepository,
  type GenerationRecord,
} from "../projects/repository/generationHistory.repository";
import { StorageBlueprintRepository } from "../projects/repository/storageBlueprint.repository";
import type {
  CreateBlueprintInput,
  GenerationExecution,
} from "../projects/types/blueprint";
import { ChatPersistenceService } from "../services/ChatPersistenceService";

const GENERATION_HISTORY = "generation_history";

function createBlueprintInput(projectId: string): CreateBlueprintInput {
  return {
    project_id: projectId,
    user_id: "ignored-by-repository",
    name: "Persistent Adventure",
    description: "A blueprint that must survive service recreation.",
    game_type: "adventure",
    genre: ["adventure"],
    target_audience: "all ages",
    difficulty: "medium",
    estimated_players: "small-group",
    gameplay: {
      mechanics: [],
      progression: {},
      balance: {},
    },
    ui_layouts: [],
    architecture: {
      client_architecture: {},
      server_architecture: {},
      networking: {},
    },
    assets: {
      models: [],
      textures: [],
      sounds: [],
      animations: [],
    },
    code_spec: {
      modules: [],
      patterns: [],
    },
  };
}

function generationRecord(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {
    id: "run-1",
    projectId: "project-1",
    pipelineId: "pipeline-1",
    status: "running",
    startedAt: 100,
    stagesCompleted: 1,
    stagesTotal: 3,
    failures: 0,
    tokenUsage: 0,
    aiCost: 0,
    ...overrides,
  };
}

class DeferredGenerationHistoryStorage extends InMemoryStorageProvider {
  private acknowledge!: () => void;
  private readonly acknowledged = new Promise<void>((resolve) => {
    this.acknowledge = resolve;
  });

  release(): void {
    this.acknowledge();
  }

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    await this.acknowledged;
    await super.setDurable(collection, id, data);
  }
}

class RejectingGenerationHistoryStorage extends InMemoryStorageProvider {
  override async setDurable<T>(
    _collection: string,
    _id: string,
    _data: T,
  ): Promise<void> {
    throw new DurableStorageError(
      "Injected generation history rejection",
      "set",
    );
  }
}

describe("CORE-1b durable runtime repositories", () => {
  it("restores blueprints, versions, executions, and chat after service recreation", async () => {
    const storage = new InMemoryStorageProvider();
    const projectId = "project-core-1b";
    const ownerId = "owner-core-1b";

    const blueprintsBeforeRestart = new StorageBlueprintRepository(storage);
    const blueprint = await blueprintsBeforeRestart.createBlueprint(
      ownerId,
      createBlueprintInput(projectId),
    );
    const version = await blueprintsBeforeRestart.saveVersion(
      blueprint.id,
      ownerId,
      "Initial durable version",
    );
    const execution: GenerationExecution = {
      id: "execution-core-1b",
      blueprint_id: blueprint.id,
      project_id: projectId,
      user_id: ownerId,
      started_at: new Date("2026-07-24T12:00:00.000Z"),
      completed_at: new Date("2026-07-24T12:00:05.000Z"),
      status: "completed",
      pipeline_steps: [
        {
          agent: "game_designer",
          status: "completed",
          started_at: new Date("2026-07-24T12:00:00.000Z"),
          completed_at: new Date("2026-07-24T12:00:05.000Z"),
          duration_ms: 5000,
        },
      ],
      total_duration_ms: 5000,
      retry_count: 0,
    };
    await blueprintsBeforeRestart.recordExecution(execution);

    const chatBeforeRestart = new ChatPersistenceService(storage);
    const firstMessage = await chatBeforeRestart.createMessage({
      projectId,
      role: "user",
      content: "Create a persistent Roblox adventure.",
    });
    await chatBeforeRestart.createMessage({
      conversationId: firstMessage.conversationId,
      role: "assistant",
      content: "The durable blueprint is ready.",
    });

    const blueprintsAfterRestart = new StorageBlueprintRepository(storage);
    const chatAfterRestart = new ChatPersistenceService(storage);

    const restoredBlueprint = await blueprintsAfterRestart.getBlueprint(
      blueprint.id,
    );
    const restoredVersion = await blueprintsAfterRestart.getVersion(
      blueprint.id,
      version.version_number,
    );
    const restoredExecution = await blueprintsAfterRestart.getExecution(
      execution.id,
    );
    const restoredConversation = chatAfterRestart.getConversation(
      firstMessage.conversationId,
    );

    expect(restoredBlueprint?.project_id).toBe(projectId);
    expect(restoredBlueprint?.created_at).toBeInstanceOf(Date);
    expect(restoredVersion?.snapshot.name).toBe("Persistent Adventure");
    expect(restoredVersion?.created_at).toBeInstanceOf(Date);
    expect(restoredExecution?.status).toBe("completed");
    expect(restoredExecution?.started_at).toBeInstanceOf(Date);
    expect(restoredExecution?.pipeline_steps[0]?.completed_at).toBeInstanceOf(
      Date,
    );
    expect(restoredConversation?.projectId).toBe(projectId);
    expect(
      restoredConversation?.messages.map((message) => message.role),
    ).toEqual(["user", "assistant"]);
  });

  it("deletes dependent versions, executions, and chat messages", async () => {
    const storage = new InMemoryStorageProvider();
    const repository = new StorageBlueprintRepository(storage);
    const blueprint = await repository.createBlueprint(
      "owner-delete",
      createBlueprintInput("project-delete"),
    );
    await repository.saveVersion(blueprint.id, "owner-delete");
    await repository.recordExecution({
      id: "execution-delete",
      blueprint_id: blueprint.id,
      project_id: blueprint.project_id,
      user_id: blueprint.user_id,
      started_at: new Date(),
      status: "running",
      pipeline_steps: [],
      retry_count: 0,
    });

    expect(await repository.deleteBlueprint(blueprint.id)).toBe(true);
    expect(await repository.getBlueprint(blueprint.id)).toBeNull();
    expect(await repository.listVersions(blueprint.id)).toEqual([]);
    expect(await repository.listExecutions(blueprint.id)).toEqual([]);

    const chat = new ChatPersistenceService(storage);
    const message = await chat.createMessage({
      projectId: "project-delete",
      role: "user",
      content: "Delete this conversation.",
    });
    expect(await chat.deleteConversation(message.conversationId)).toBe(true);
    expect(chat.getConversation(message.conversationId)).toBeNull();
    expect(storage.count("chat_messages")).toBe(0);
  });
});

describe("CORE-1b generation history acknowledgement", () => {
  it("does not publish a pending record before acknowledgement", async () => {
    const storage = new DeferredGenerationHistoryStorage();
    const repository = new StorageGenerationHistoryRepository(storage);
    const entry = generationRecord();

    const mutation = repository.record(entry);
    await Promise.resolve();
    await Promise.resolve();

    expect(repository.getByPipeline(entry.pipelineId)).toBeNull();
    expect(storage.count(GENERATION_HISTORY)).toBe(0);

    storage.release();
    await mutation;
    expect(repository.getByPipeline(entry.pipelineId)).toBe(entry);
  });

  it("does not publish a rejected create", async () => {
    const storage = new RejectingGenerationHistoryStorage();
    const repository = new StorageGenerationHistoryRepository(storage);
    const entry = generationRecord();

    await expect(repository.record(entry)).rejects.toBeInstanceOf(
      DurableStorageError,
    );
    expect(repository.getByPipeline(entry.pipelineId)).toBeNull();
  });

  it("preserves the exact previous record after a rejected update", async () => {
    const storage = new RejectingGenerationHistoryStorage();
    const previous = generationRecord();
    storage.set(GENERATION_HISTORY, previous.pipelineId, previous);
    const repository = new StorageGenerationHistoryRepository(storage);
    const updated = generationRecord({
      status: "completed",
      finishedAt: 200,
      duration: 100,
      stagesCompleted: 3,
    });

    await expect(repository.record(updated)).rejects.toBeInstanceOf(
      DurableStorageError,
    );
    expect(repository.getByPipeline(previous.pipelineId)).toBe(previous);
  });

  it("publishes a successful record immediately after acknowledgement", async () => {
    const storage = new InMemoryStorageProvider();
    const repository = new StorageGenerationHistoryRepository(storage);
    const entry = generationRecord({ status: "completed" });

    await repository.record(entry);

    expect(repository.getByPipeline(entry.pipelineId)).toBe(entry);
    expect(repository.getByProject(entry.projectId)).toEqual([entry]);
  });
});
