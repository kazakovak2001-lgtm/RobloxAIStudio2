/**
 * AUDIT-ID-EXEC-001 — generation execution ids must be globally unique.
 *
 * `startGeneration` built its id as `exec-${Date.now()}`, and
 * `generation_executions` is keyed by that id alone across every project. Two
 * starts inside the same millisecond therefore produced the same key, and
 * `recordExecution` writes through `setDurable`, a blind upsert — so the second
 * start silently overwrote the first execution's `project_id`, `blueprint_id`,
 * owner and status.
 *
 * These tests freeze `Date.now()` to make the collision deterministic rather
 * than depending on how fast the machine runs.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { StorageBlueprintRepository } from "../projects/repository/storageBlueprint.repository";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../socket/streaming";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ArtifactStore } from "../pipeline/v2";
import type { IBlueprintRepository } from "../projects/repository/blueprint.repository";
import type { CreateBlueprintInput } from "../projects/types/blueprint";

const FROZEN_MS = 1_777_000_000_000;
const PROJECT_A = "project-alpha";
const PROJECT_B = "project-beta";
const OWNER_A = "owner-alpha";
const OWNER_B = "owner-beta";

function blueprintInput(
  projectId: string,
  userId: string,
): CreateBlueprintInput {
  return {
    project_id: projectId,
    user_id: userId,
    name: `Blueprint for ${projectId}`,
    description: "A generic playable slice used as an identity fixture.",
    game_type: "adventure",
    genre: ["exploration"],
    difficulty: "medium",
    estimated_players: "solo",
    target_audience: "all ages",
  } as CreateBlueprintInput;
}

function buildService(repository: IBlueprintRepository) {
  return new GameGenerationService(
    repository,
    new BlueprintCache(),
    new StreamingUpdateHandler(new PipelineEventEmitter()),
    new AgentRegistry(),
    new ArtifactStore(),
  );
}

/** Every start in the test lands in the same millisecond. */
function freezeClock() {
  return vi.spyOn(Date, "now").mockReturnValue(FROZEN_MS);
}

describe("AUDIT-ID-EXEC-001 generation execution identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("A — two starts in the same millisecond receive different ids", async () => {
    const repository = new InMemoryBlueprintRepository();
    const service = buildService(repository);
    const blueprint = await service.createBlueprint(
      OWNER_A,
      PROJECT_A,
      blueprintInput(PROJECT_A, OWNER_A),
    );

    const clock = freezeClock();
    const first = await service.startGeneration(blueprint.id, OWNER_A);
    const second = await service.startGeneration(blueprint.id, OWNER_A);
    clock.mockRestore();

    expect(Date.now()).not.toBe(FROZEN_MS); // clock really was frozen, then freed
    expect(first.id).not.toBe(second.id);
  });

  it("B — concurrent starts for different projects cannot collide", async () => {
    const repository = new InMemoryBlueprintRepository();
    const service = buildService(repository);
    const blueprintA = await service.createBlueprint(
      OWNER_A,
      PROJECT_A,
      blueprintInput(PROJECT_A, OWNER_A),
    );
    const blueprintB = await service.createBlueprint(
      OWNER_B,
      PROJECT_B,
      blueprintInput(PROJECT_B, OWNER_B),
    );

    const clock = freezeClock();
    const [execA, execB] = await Promise.all([
      service.startGeneration(blueprintA.id, OWNER_A),
      service.startGeneration(blueprintB.id, OWNER_B),
    ]);
    clock.mockRestore();

    expect(execA.id).not.toBe(execB.id);
    expect(execA.project_id).toBe(PROJECT_A);
    expect(execB.project_id).toBe(PROJECT_B);
  });

  it("C — ids keep the exec- prefix that logs and evidence are read by", async () => {
    const repository = new InMemoryBlueprintRepository();
    const service = buildService(repository);
    const blueprint = await service.createBlueprint(
      OWNER_A,
      PROJECT_A,
      blueprintInput(PROJECT_A, OWNER_A),
    );

    const clock = freezeClock();
    const execution = await service.startGeneration(blueprint.id, OWNER_A);
    clock.mockRestore();

    expect(execution.id).toMatch(
      /^exec-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("D — both executions stay separately retrievable with the right project", async () => {
    const repository = new InMemoryBlueprintRepository();
    const service = buildService(repository);
    const blueprintA = await service.createBlueprint(
      OWNER_A,
      PROJECT_A,
      blueprintInput(PROJECT_A, OWNER_A),
    );
    const blueprintB = await service.createBlueprint(
      OWNER_B,
      PROJECT_B,
      blueprintInput(PROJECT_B, OWNER_B),
    );

    const clock = freezeClock();
    const execA = await service.startGeneration(blueprintA.id, OWNER_A);
    const execB = await service.startGeneration(blueprintB.id, OWNER_B);
    clock.mockRestore();

    // The collision destroyed exactly this: one record survived under a key
    // both projects claimed.
    await expect(service.getExecution(execA.id)).resolves.toMatchObject({
      id: execA.id,
      project_id: PROJECT_A,
      blueprint_id: blueprintA.id,
      user_id: OWNER_A,
    });
    await expect(service.getExecution(execB.id)).resolves.toMatchObject({
      id: execB.id,
      project_id: PROJECT_B,
      blueprint_id: blueprintB.id,
      user_id: OWNER_B,
    });
    await expect(service.getExecutions(blueprintA.id)).resolves.toHaveLength(1);
    await expect(service.getExecutions(blueprintB.id)).resolves.toHaveLength(1);
  });

  it("E — the rest of the execution record is unchanged", async () => {
    const repository = new InMemoryBlueprintRepository();
    const service = buildService(repository);
    const blueprint = await service.createBlueprint(
      OWNER_A,
      PROJECT_A,
      blueprintInput(PROJECT_A, OWNER_A),
    );

    const clock = freezeClock();
    const execution = await service.startGeneration(blueprint.id, OWNER_A);
    clock.mockRestore();

    expect(execution).toMatchObject({
      blueprint_id: blueprint.id,
      project_id: PROJECT_A,
      user_id: OWNER_A,
      status: "running",
      retry_count: 0,
      pipeline_steps: [],
    });
    // `started_at` comes from `new Date()`, which the `Date.now` spy does not
    // intercept, so it stays a real timestamp — recorded here so the fixture's
    // reach is not overstated.
    expect(execution.started_at).toBeInstanceOf(Date);
    expect(execution.started_at.getTime()).toBeGreaterThan(0);
    // Status lookup and update paths still work against the new id shape.
    await expect(
      repository.updateExecution(execution.id, { status: "completed" }),
    ).resolves.toMatchObject({ id: execution.id, status: "completed" });
    await expect(service.getExecution(execution.id)).resolves.toMatchObject({
      status: "completed",
    });
  });

  it("F — distinct ids coexist in the durable collection they share", async () => {
    // `recordExecution` writes through `setDurable`, which has no create-only
    // option, and both projects' executions live in one `generation_executions`
    // collection. The id is therefore the only thing keeping them apart, which
    // is why this slice fixes the id rather than the write.
    const storage = new InMemoryStorageProvider();
    const service = buildService(new StorageBlueprintRepository(storage));
    const blueprintA = await service.createBlueprint(
      OWNER_A,
      PROJECT_A,
      blueprintInput(PROJECT_A, OWNER_A),
    );
    const blueprintB = await service.createBlueprint(
      OWNER_B,
      PROJECT_B,
      blueprintInput(PROJECT_B, OWNER_B),
    );

    const clock = freezeClock();
    const execA = await service.startGeneration(blueprintA.id, OWNER_A);
    const execB = await service.startGeneration(blueprintB.id, OWNER_B);
    clock.mockRestore();

    const stored = storage.list<{ id: string; project_id: string }>(
      "generation_executions",
    );
    expect(stored).toHaveLength(2);
    expect(new Set(stored.map((execution) => execution.id))).toEqual(
      new Set([execA.id, execB.id]),
    );
    expect(new Set(stored.map((execution) => execution.project_id))).toEqual(
      new Set([PROJECT_A, PROJECT_B]),
    );
  });
});
