/**
 * MAR-004 — the HTTP contract for a retried `POST /:projectId/generate`.
 *
 * The coordinator-level mechanism is proved in `mar004.idempotent-start.test.ts`.
 * This is the route it was built for: the header a real client sends, over a
 * real HTTP server, through the actual handler — not the coordinator called
 * directly.
 *
 * Public contract, pinned here rather than left implicit:
 *
 *   - `Idempotency-Key` request header. Explicit and client-supplied, not
 *     server-generated: the server cannot mint a value that names "the same
 *     request" before the request exists, and minting one on a miss would make
 *     every retry look like a fresh request — the exact defect this closes.
 *   - Required. Missing it is answered as 400 before any blueprint lookup or
 *     durable work, not silently treated as a legacy non-idempotent path. An
 *     optional key leaves open the same hole for whichever caller forgets one.
 *   - Bound to principal, project, and a fingerprint of the one body field
 *     that changes what gets generated (`blueprintId`). The same key with any
 *     of those different is a conflict, never a substituted answer.
 *   - A replay costs nothing: no second `prepareGeneration` call, no second
 *     execution, no incremented `generationCount`, no second enqueue.
 *
 * What this file does not attempt: a different-principal conflict at the route
 * level. This product has no multi-owner project, so two different real users
 * cannot both be authorized for one project — a different principal is turned
 * away by `requireProjectAccess` before the idempotency check is ever reached.
 * That case is proved at the coordinator level instead, where it is reachable.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { GenerationOutcomeCoordinator } from "../platform/projects/ProjectLifecycleCoordinator";
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
import type { GenerationExecution } from "../types/blueprint";

const OWNER = "owner-alpha";
const TOKEN = "token-alpha";

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
      token === TOKEN ? { userId: OWNER } : null,
  };
  const runtime = createProjectRuntime(storage, auth as never);

  const project = await runtime.projectRepository.createDurable(
    OWNER,
    "Ruins of the Storm Core",
    "adventure",
    "A mountain research complex with exactly three cores.",
    {},
  );
  const otherProject = await runtime.projectRepository.createDurable(
    OWNER,
    "A second project, same owner",
    "adventure",
    "Used only for the cross-project idempotency-key conflict case.",
    {},
  );

  const repository = new InMemoryBlueprintRepository(storage);
  const service = new GameGenerationService(
    repository,
    new BlueprintCache(),
    new StreamingUpdateHandler(new PipelineEventEmitter()),
    new AgentRegistry(),
    new ArtifactStore(),
  );

  // Mocked so a call count is observable and so no real pipeline planning
  // runs. It still reads the real, route-auto-created blueprint, so a replay's
  // `getBlueprint(execution.blueprint_id)` finds something real.
  let prepareCallCount = 0;
  const prepareGeneration = vi
    .spyOn(service, "prepareGeneration")
    .mockImplementation(async (_blueprintIdOrProjectId, userId, projectId) => {
      prepareCallCount += 1;
      const blueprint = await service.getBlueprintByProject(projectId!);
      if (!blueprint) {
        throw new Error(
          "Fixture expected the route to have created a blueprint already",
        );
      }
      const execution: GenerationExecution = {
        id: `exec-${prepareCallCount}`,
        blueprint_id: blueprint.id,
        project_id: projectId!,
        user_id: userId,
        started_at: new Date(0),
        status: "running",
        retry_count: 0,
        pipeline_steps: [],
      };
      return { execution, blueprint, versionMutations: [] };
    });

  // The real pipeline is not under test here and would race the explicit
  // lifecycle control some of these tests do (`GenerationOutcomeCoordinator`),
  // so it is not allowed to run at all. What matters is whether it was asked
  // to run a second time, not what it produces.
  const enqueueGeneration = vi
    .spyOn(service, "enqueueGeneration")
    .mockImplementation(() => undefined);

  const activateProjectExecution = vi.fn();
  const studioManager = {
    activateProjectExecution,
  } as unknown as StudioIntegrationManager;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/generation",
    createGameGenerationRouter(service, studioManager, runtime),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }
  const base = `http://127.0.0.1:${address.port}/api/generation`;

  const generate = (
    projectId: string,
    body: Record<string, unknown>,
    opts: { idempotencyKey?: string; token?: string } = {},
  ) =>
    fetch(`${base}/${projectId}/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.token ?? TOKEN}`,
        ...(opts.idempotencyKey !== undefined
          ? { "idempotency-key": opts.idempotencyKey }
          : {}),
      },
      body: JSON.stringify(body),
    });

  return {
    storage,
    runtime,
    service,
    project,
    otherProject,
    generate,
    prepareCallCount: () => prepareCallCount,
    activateProjectExecution,
    enqueueGeneration,
    projectState: (id: string) => runtime.projectRepository.get(id),
  };
}

describe("MAR-004 a first request succeeds", () => {
  it("starts a generation and returns its execution id", async () => {
    const h = await harness();

    const response = await h.generate(
      h.project.id,
      {},
      { idempotencyKey: "key-1" },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      status: "generation_started",
    });
    expect(h.prepareCallCount()).toBe(1);
    expect(h.activateProjectExecution).toHaveBeenCalledTimes(1);
    expect(h.enqueueGeneration).toHaveBeenCalledTimes(1);
    expect(h.projectState(h.project.id)?.generationCount).toBe(1);
  });
});

describe("MAR-004 a retry while the run is active replays it", () => {
  it("returns the original execution and starts nothing new", async () => {
    const h = await harness();

    const first = await h.generate(
      h.project.id,
      {},
      { idempotencyKey: "key-2" },
    );
    const firstBody = (await first.json()) as { executionId: string };

    // The response never reached the caller; the claim is still held, since
    // nothing here has completed the run. This is the exact window the
    // mechanism exists for.
    const retry = await h.generate(
      h.project.id,
      {},
      { idempotencyKey: "key-2" },
    );

    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      success: true,
      executionId: firstBody.executionId,
      status: "generation_started",
    });
    expect(h.prepareCallCount()).toBe(1);
    expect(h.activateProjectExecution).toHaveBeenCalledTimes(1);
    expect(h.enqueueGeneration).toHaveBeenCalledTimes(1);
    expect(h.projectState(h.project.id)?.generationCount).toBe(1);
  });
});

describe("MAR-004 a retry after completion still replays, not restarts", () => {
  it("returns the original execution without incrementing generationCount", async () => {
    const h = await harness();

    const first = await h.generate(
      h.project.id,
      {},
      { idempotencyKey: "key-3" },
    );
    const firstBody = (await first.json()) as { executionId: string };

    // The run finished and released its claim — the state a genuinely late
    // retry would actually arrive into.
    await new GenerationOutcomeCoordinator(h.storage).commit(
      firstBody.executionId,
      { status: "completed" },
    );

    const retry = await h.generate(
      h.project.id,
      {},
      { idempotencyKey: "key-3" },
    );

    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      executionId: firstBody.executionId,
    });
    // The claim is gone, so nothing about "a run is active" can answer this.
    // Only the durable idempotency record can, and it must outlive the claim.
    expect(h.prepareCallCount()).toBe(1);
    expect(h.projectState(h.project.id)?.generationCount).toBe(1);
  });
});

describe("MAR-004 one key, a different request, is a conflict", () => {
  it("refuses the same key against a different payload", async () => {
    const h = await harness();
    await h.generate(h.project.id, {}, { idempotencyKey: "key-4" });
    const blueprint = await h.service.getBlueprintByProject(h.project.id);

    // Same key, but this time naming a blueprint explicitly rather than
    // leaving it to auto-resolve — a different request wearing the same key.
    const response = await h.generate(
      h.project.id,
      { blueprintId: blueprint!.id },
      { idempotencyKey: "key-4" },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "idempotency_key_conflict",
    });
    // Refused before any second start attempt, not after one.
    expect(h.prepareCallCount()).toBe(1);
  });

  it("refuses the same key against a different project", async () => {
    const h = await harness();
    await h.generate(h.project.id, {}, { idempotencyKey: "key-5" });

    const response = await h.generate(
      h.otherProject.id,
      {},
      { idempotencyKey: "key-5" },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "idempotency_key_conflict",
    });
    // The second project must show no trace of having started anything.
    expect(h.projectState(h.otherProject.id)?.generationCount).toBe(0);
    expect(h.prepareCallCount()).toBe(1);
  });
});

describe("MAR-004 single-flight is unchanged", () => {
  it("still answers a genuinely new key with the existing active-generation conflict", async () => {
    const h = await harness();
    await h.generate(h.project.id, {}, { idempotencyKey: "key-6" });

    // A different key is a different request. While the first run is active,
    // this must still hit the pre-existing single-flight policy.
    const response = await h.generate(
      h.project.id,
      {},
      { idempotencyKey: "key-6-different" },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "active_generation_conflict",
    });
  });
});

describe("MAR-004 a missing key has an explicit contract", () => {
  it("refuses the request as 400 rather than starting it unsafely", async () => {
    const h = await harness();

    const response = await h.generate(h.project.id, {});

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Idempotency-Key header is required",
    });
    // Refused before any durable work, and before the caller-supplied
    // blueprintId is even looked at.
    expect(h.prepareCallCount()).toBe(0);
    expect(h.projectState(h.project.id)?.generationCount).toBe(0);
  });
});
