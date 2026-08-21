/**
 * SEC-GENERATION-BLUEPRINT-001 — route-level behaviour of the project binding.
 *
 * `secgenerationblueprint1.project-binding.test.ts` pins the invariant inside
 * `GameGenerationService`. This file pins it over real HTTP, because the thing
 * the finding is about is what an authorized caller can make the endpoint do:
 * `POST /:projectId/generate` authorizes the URL `projectId` but takes
 * `blueprintId` from the body, so a caller authorized for project A could
 * previously supply project B's blueprint id.
 *
 * The rejection cases assert durable state directly rather than only the status
 * code, because a hidden response over a completed mutation would not close the
 * finding: the project status, the generation count, the execution record, the
 * history entry and the Studio activation must all be untouched.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { createProjectRuntime } from "../routes/projects";
import { createGameGenerationRouter } from "../routes/game-generation";
import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../socket/streaming";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ArtifactStore } from "../pipeline/v2";
import type { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import type { CreateBlueprintInput } from "../projects/types/blueprint";
import type { GenerationExecution } from "../types/blueprint";

const OWNER_A = "owner-alpha";
const OWNER_B = "owner-beta";
const TOKEN_A = "token-alpha";
const TOKEN_B = "token-beta";

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

describe("SEC-GENERATION-BLUEPRINT-001 POST /:projectId/generate", () => {
  let server: Server | undefined;

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise<void>(
      (resolve) => server?.close(() => resolve()) ?? resolve(),
    );
    server = undefined;
    vi.restoreAllMocks();
  });

  async function harness() {
    const storage = new InMemoryStorageProvider();
    const auth = {
      validateToken: async (token: string) =>
        token === TOKEN_A
          ? { userId: OWNER_A }
          : token === TOKEN_B
            ? { userId: OWNER_B }
            : null,
    };
    const projectRuntime = createProjectRuntime(storage, auth as never);

    const projectA = await projectRuntime.projectRepository.createDurable(
      OWNER_A,
      "Project Alpha",
      "adventure",
      "Authorized project",
      {},
    );
    const projectB = await projectRuntime.projectRepository.createDurable(
      OWNER_B,
      "Project Beta",
      "adventure",
      "Someone else's project",
      {},
    );

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
      projectA.id,
      blueprintInput(projectA.id, OWNER_A),
    );
    const blueprintB = await service.createBlueprint(
      OWNER_B,
      projectB.id,
      blueprintInput(projectB.id, OWNER_B),
    );

    const prepareGeneration = vi.spyOn(service, "prepareGeneration");
    const recordExecution = vi.spyOn(repository, "recordExecution");
    const activateProjectExecution = vi.fn();
    const studioManager = {
      activateProjectExecution,
    } as unknown as StudioIntegrationManager;

    const app = express();
    app.use(express.json());
    app.use(
      "/api/generation",
      createGameGenerationRouter(service, studioManager, projectRuntime),
    );
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP test server");
    }
    const base = `http://127.0.0.1:${address.port}/api/generation`;

    // MAR-004 made Idempotency-Key required. A fresh key per call keeps every
    // call here a distinct logical request, which is what this file's cases
    // are about; idempotency itself is covered in
    // mar004.generate-route-idempotency.test.ts.
    let nextIdempotencyKey = 0;
    const generate = (
      projectId: string,
      body: Record<string, unknown>,
      token?: string,
      idempotencyKey = `key-${(nextIdempotencyKey += 1)}`,
    ) =>
      fetch(`${base}/${projectId}/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });

    return {
      projectRuntime,
      projectA,
      projectB,
      blueprintA,
      blueprintB,
      prepareGeneration,
      recordExecution,
      activateProjectExecution,
      generate,
      project: (id: string) => projectRuntime.projectRepository.get(id),
      history: (id: string) =>
        projectRuntime.generationHistory.getByProject(id),
      executions: (blueprintId: string) =>
        repository.listExecutions(blueprintId),
    };
  }

  /**
   * The pipeline itself is not under test and would run real agents, so the
   * success case stubs the start and asserts the arguments the route binds:
   * the blueprint the caller asked for, and the authorized project as the
   * expected owner. That the service then enforces that owner is covered
   * behaviourally in secgenerationblueprint1.project-binding.test.ts.
   */
  function stubStart(
    spy: ReturnType<typeof vi.spyOn>,
    projectId: string,
    blueprintId: string,
  ) {
    const execution: GenerationExecution = {
      id: "exec-stubbed",
      blueprint_id: blueprintId,
      project_id: projectId,
      user_id: OWNER_A,
      started_at: new Date(0),
      status: "running",
      retry_count: 0,
      pipeline_steps: [],
    };
    // prepareGeneration returns the blueprint alongside the execution, because
    // the caller commits the execution in one transaction and then enqueues the
    // pipeline with the blueprint it already resolved.
    spy.mockResolvedValue({
      execution,
      blueprint: { id: blueprintId, project_id: projectId },
      // The immutable snapshot commits with the execution, so prepare returns
      // its mutations for the caller's transaction. Empty here: this fixture is
      // about the ownership binding, not about versioning.
      versionMutations: [],
    } as never);
    return execution;
  }

  it("A — accepts a blueprint that belongs to the authorized project", async () => {
    const h = await harness();
    stubStart(h.prepareGeneration, h.projectA.id, h.blueprintA.id);

    const response = await h.generate(
      h.projectA.id,
      { blueprintId: h.blueprintA.id },
      TOKEN_A,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      executionId: "exec-stubbed",
      status: "generation_started",
    });
    // Scheduling happened, bound to the authorized project.
    expect(h.prepareGeneration).toHaveBeenCalledWith(
      h.blueprintA.id,
      OWNER_A,
      h.projectA.id,
    );
    expect(h.project(h.projectA.id)?.status).toBe("generating");
    expect(h.history(h.projectA.id)).toHaveLength(1);
    expect(h.activateProjectExecution).toHaveBeenCalledWith(
      h.projectA.id,
      "exec-stubbed",
    );
  });

  it("B — rejects another project's blueprint with no side effect at all", async () => {
    const h = await harness();
    const before = {
      a: JSON.stringify(h.project(h.projectA.id)),
      b: JSON.stringify(h.project(h.projectB.id)),
    };

    // The attack: authorized for A, supplying B's blueprint id.
    const response = await h.generate(
      h.projectA.id,
      { blueprintId: h.blueprintB.id },
      TOKEN_A,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Blueprint not found for this project",
    });

    // Rejected before any work: no start, no execution, no project mutation,
    // no history, no Studio activation, for either project.
    expect(h.prepareGeneration).not.toHaveBeenCalled();
    expect(h.recordExecution).not.toHaveBeenCalled();
    expect(h.activateProjectExecution).not.toHaveBeenCalled();
    expect(JSON.stringify(h.project(h.projectA.id))).toBe(before.a);
    expect(JSON.stringify(h.project(h.projectB.id))).toBe(before.b);
    expect(h.history(h.projectA.id)).toEqual([]);
    expect(h.history(h.projectB.id)).toEqual([]);
    await expect(h.executions(h.blueprintA.id)).resolves.toEqual([]);
    await expect(h.executions(h.blueprintB.id)).resolves.toEqual([]);
  });

  it("C — rejects an unknown blueprint id instead of falling back to the project", async () => {
    const h = await harness();

    const response = await h.generate(
      h.projectA.id,
      { blueprintId: "blueprint-does-not-exist" },
      TOKEN_A,
    );

    expect(response.status).toBe(404);
    // The project does own a blueprint, so the pre-fix resolution would have
    // silently generated from it. An explicitly supplied id must not be
    // quietly replaced by a different one.
    expect(h.prepareGeneration).not.toHaveBeenCalled();
    expect(h.project(h.projectA.id)?.status).toBe(h.projectA.status);
    expect(h.history(h.projectA.id)).toEqual([]);
  });

  it("C2 — still resolves the project's own blueprint when no id is supplied", async () => {
    const h = await harness();
    stubStart(h.prepareGeneration, h.projectA.id, h.blueprintA.id);

    const response = await h.generate(h.projectA.id, {}, TOKEN_A);

    expect(response.status).toBe(200);
    // Unchanged contract: the omitted-id path still resolves by project.
    expect(h.prepareGeneration).toHaveBeenCalledWith(
      h.projectA.id,
      OWNER_A,
      h.projectA.id,
    );
  });

  it("D — refuses a foreign project and starts no work", async () => {
    const h = await harness();

    const foreign = await h.generate(
      h.projectB.id,
      { blueprintId: h.blueprintB.id },
      TOKEN_A,
    );
    // This asserted 403 when it was written, to show that the blueprint slice
    // had not disturbed requireProjectAccess. SEC-PROJECT-ACCESS-DISCLOSURE-001
    // then changed that control deliberately: a foreign project is now answered
    // as an absent one, so a caller cannot learn which project ids are real.
    // What this test guards is unchanged — the route refuses and does no work.
    expect(foreign.status).toBe(404);

    const anonymous = await h.generate(
      h.projectA.id,
      { blueprintId: h.blueprintA.id },
      undefined,
    );
    expect(anonymous.status).toBe(401);

    expect(h.prepareGeneration).not.toHaveBeenCalled();
    expect(h.recordExecution).not.toHaveBeenCalled();
  });
});
