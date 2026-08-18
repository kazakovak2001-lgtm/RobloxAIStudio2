/**
 * BLUEPRINT-2 / BLUEPRINT-STALE-001 — a regenerate uses the current brief.
 *
 * A blueprint was built from the project exactly once. Editing the brief
 * afterwards changed the project and left the blueprint alone, so the sequence
 *
 *   create project → generate → rewrite the brief → generate again
 *
 * silently regenerated the original design, and nothing told the user why their
 * rewrite had no effect.
 *
 * Reconciliation carries over only what the user actually stated. A value the
 * system assumed must not overwrite whatever the blueprint holds, or a default
 * would win against a deliberate refinement — the same confusion as
 * INTENT-DEFAULT-CONTAMINATION-001, pointed the other way.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { GenerationOutcomeCoordinator } from "../platform/projects/ProjectLifecycleCoordinator";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { GameGenerationService } from "../projects/services/game-generation.service";
import { ArtifactStore } from "../pipeline/v2";
import {
  PipelineEventEmitter,
  StreamingUpdateHandler,
} from "../socket/streaming";
import {
  createGameGenerationRouter,
  projectStatedIntent,
} from "../routes/game-generation";
import { createProjectRuntime } from "../routes/projects";
import type { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import type { SaaSProject } from "../platform/projects/SaaSProjectRepository";

const OWNER = "owner-alpha";
const TOKEN = "token-alpha";

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
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

  const repository = new InMemoryBlueprintRepository(storage);
  const service = new GameGenerationService(
    repository,
    new BlueprintCache(),
    new StreamingUpdateHandler(new PipelineEventEmitter()),
    new PipelineEventEmitter(),
    undefined,
    new AgentRegistry(),
    new ArtifactStore(),
  );
  const studioManager = {
    activateProjectExecution: () => undefined,
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

  return {
    storage,
    runtime,
    service,
    project,
    generate: () =>
      fetch(`${base}/${project.id}/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({}),
      }),
  };
}

describe("BLUEPRINT-2 project intent reconciliation", () => {
  it("carries a rewritten brief into the next generation", async () => {
    const h = await harness();
    await h.generate();

    await h.runtime.projectRepository.updateDurable(h.project.id, {
      description: "Actually an underwater station with two beacons.",
    });
    await h.generate();

    const blueprint = await h.service.getBlueprintByProject(h.project.id);
    // The second run used to regenerate the original design, because the
    // blueprint was only ever built from the project once.
    expect(blueprint?.description).toBe(
      "Actually an underwater station with two beacons.",
    );
  });

  it("does not let an assumed value overwrite what the blueprint holds", async () => {
    const h = await harness();
    await h.generate();

    const before = await h.service.getBlueprintByProject(h.project.id);
    // The project never stated a target audience, so the blueprint's value came
    // from a default. A later generate must not treat that as user intent and
    // rewrite whatever the blueprint has since been refined to.
    await h.service.updateBlueprint(before!.id, {
      target_audience: "speedrunners",
    });
    await h.generate();

    const after = await h.service.getBlueprintByProject(h.project.id);
    expect(after?.target_audience).toBe("speedrunners");
  });

  it("records that the reconciled fields were stated, not assumed", async () => {
    const h = await harness();
    await h.generate();

    await h.runtime.projectRepository.updateDurable(h.project.id, {
      targetAudience: "teens",
      difficulty: "hard",
    });
    await h.generate();

    const blueprint = await h.service.getBlueprintByProject(h.project.id);
    expect(blueprint?.target_audience).toBe("teens");
    expect(blueprint?.difficulty).toBe("hard");
    expect(blueprint?.assumed_fields).not.toContain("target_audience");
    expect(blueprint?.assumed_fields).not.toContain("difficulty");
  });

  it("binds each run to the design that run consumed", async () => {
    const h = await harness();
    await h.generate();
    const first = h.storage
      .list<{ id: string; blueprint_snapshot_hash?: string }>(
        "generation_executions",
      )
      .map((execution) => execution.blueprint_snapshot_hash);

    // A project may only have one active generation, so the first has to reach
    // a terminal state before the second is admitted. Releasing the claim here
    // is what a finished run does; without it the second request is correctly
    // refused with a conflict and this would be testing nothing.
    const running = h.storage.list<{ id: string }>("generation_executions")[0];
    await new GenerationOutcomeCoordinator(h.storage).commit(running.id, {
      status: "completed",
      completed_at: new Date(1),
    });

    await h.runtime.projectRepository.updateDurable(h.project.id, {
      description: "A third design, different again.",
    });
    await h.generate();

    const hashes = h.storage
      .list<{ blueprint_snapshot_hash?: string }>("generation_executions")
      .map((execution) => execution.blueprint_snapshot_hash);
    // Reconciliation and snapshotting compose: the two runs are bound to two
    // different designs rather than both pointing at whatever the blueprint
    // says now.
    expect(new Set(hashes).size).toBe(2);
    expect(hashes).toContain(first[0]);
  });
});

describe("projectStatedIntent", () => {
  it("separates what the user stated from what has to be assumed", () => {
    const project = {
      id: "p",
      ownerId: OWNER,
      name: "Named",
      description: "  ",
      genre: "horror",
      difficulty: "nonsense",
    } as SaaSProject;

    const { stated, assumedFields } = projectStatedIntent(project);

    expect(stated.genre).toEqual(["horror"]);
    expect(stated.description).toBeUndefined();
    expect(stated.difficulty).toBeUndefined();
    expect(assumedFields).toEqual(
      expect.arrayContaining(["description", "difficulty"]),
    );
    expect(assumedFields).not.toContain("genre");
  });
});
