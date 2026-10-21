/**
 * SEC-GENERATION-BLUEPRINT-001 — generation must stay inside the authorized project.
 *
 * `startGeneration` resolves its first argument against both blueprint ids and
 * project ids, and the execution it records takes its `project_id` from the
 * resolved blueprint. A caller authorized for project A could therefore pass a
 * blueprint id belonging to project B and have work scheduled, and an execution
 * recorded, against B. Hiding that execution afterwards would not help — the
 * state mutation has already happened.
 *
 * These tests pin the invariant below the Express route, so it survives any
 * future caller that reaches the service directly.
 */

import { describe, expect, it, vi } from "vitest";
import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../socket/streaming";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ArtifactStore } from "../pipeline/v2";
import type { CreateBlueprintInput } from "../projects/types/blueprint";

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
    description: "A generic playable slice used as an authorization fixture.",
    game_type: "adventure",
    genre: ["exploration"],
    difficulty: "medium",
    estimated_players: "solo",
    target_audience: "all ages",
  } as CreateBlueprintInput;
}

/**
 * A service whose generation pipeline never runs. Only the synchronous
 * pre-scheduling path is under test, and letting the real queue start would
 * make these assertions depend on agent behaviour.
 */
async function buildService() {
  const repository = new InMemoryBlueprintRepository();
  const service = new GameGenerationService(
    repository,
    new BlueprintCache(),
    new StreamingUpdateHandler(new PipelineEventEmitter()),
    new AgentRegistry(),
    new ArtifactStore(),
  );
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
  const recorded: string[] = [];
  const recordExecution = repository.recordExecution.bind(repository);
  vi.spyOn(repository, "recordExecution").mockImplementation(
    async (execution) => {
      recorded.push(execution.project_id);
      return recordExecution(execution);
    },
  );
  return { service, repository, blueprintA, blueprintB, recorded };
}

describe("SEC-GENERATION-BLUEPRINT-001 service-level project binding", () => {
  it("starts generation for a blueprint that belongs to the project", async () => {
    const { service, blueprintA, recorded } = await buildService();

    const execution = await service.startGeneration(
      blueprintA.id,
      OWNER_A,
      PROJECT_A,
    );

    expect(execution.project_id).toBe(PROJECT_A);
    expect(execution.blueprint_id).toBe(blueprintA.id);
    expect(recorded).toEqual([PROJECT_A]);
  });

  it("rejects a blueprint belonging to another project and records nothing", async () => {
    const { service, blueprintB, recorded } = await buildService();

    // The former attack: authorized for A, supplying B's blueprint id.
    await expect(
      service.startGeneration(blueprintB.id, OWNER_A, PROJECT_A),
    ).rejects.toThrow(/does not belong to project/);

    // No execution for either project — the mutation never happened.
    expect(recorded).toEqual([]);
  });

  it("leaves both projects' execution history untouched after a rejection", async () => {
    const { service, repository, blueprintA, blueprintB } =
      await buildService();

    await expect(
      service.startGeneration(blueprintB.id, OWNER_A, PROJECT_A),
    ).rejects.toThrow();

    for (const blueprint of [blueprintA, blueprintB]) {
      const executions = await repository.listExecutions(blueprint.id);
      expect(executions, `executions for ${blueprint.project_id}`).toHaveLength(
        0,
      );
    }
  });

  it("rejects a project id that is not the expected project", async () => {
    const { service, recorded } = await buildService();

    // Resolution by project id is equally capable of crossing the boundary.
    await expect(
      service.startGeneration(PROJECT_B, OWNER_A, PROJECT_A),
    ).rejects.toThrow(/does not belong to project/);
    expect(recorded).toEqual([]);
  });

  it("fails closed for a nonexistent blueprint id", async () => {
    const { service, recorded } = await buildService();

    await expect(
      service.startGeneration("blueprint-does-not-exist", OWNER_A, PROJECT_A),
    ).rejects.toThrow(/Blueprint not found/);
    expect(recorded).toEqual([]);
  });

  it("resolves by project id when the caller supplies the project itself", async () => {
    const { service, blueprintA } = await buildService();

    const execution = await service.startGeneration(
      PROJECT_A,
      OWNER_A,
      PROJECT_A,
    );

    expect(execution.project_id).toBe(PROJECT_A);
    expect(execution.blueprint_id).toBe(blueprintA.id);
  });

  it("keeps the pre-existing two-argument contract working", async () => {
    const { service, blueprintA } = await buildService();

    // Existing internal callers pass no expected project; behaviour unchanged.
    const execution = await service.startGeneration(blueprintA.id, OWNER_A);

    expect(execution.project_id).toBe(PROJECT_A);
  });
});
