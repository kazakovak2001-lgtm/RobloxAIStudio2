/**
 * PROJECT-ERASURE-1 — deleting a project must remove every directly
 * project-owned durable record, atomically, with no silent partial success.
 *
 * The previous delete removed only the "projects" record. Blueprint,
 * blueprint version, generation execution, blueprint change proposal and
 * generation history records referencing the project by id all survived as
 * orphaned durable data.
 *
 * These tests drive the real DELETE /projects/:id route over HTTP and assert
 * what durable storage actually holds afterward, not source text.
 */

import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { AuthService } from "../../platform/auth/AuthService";
import { SaaSProjectRepository } from "../../platform/projects";
import {
  DurableStorageError,
  type DurableMutation,
  type DurableMutationResult,
  InMemoryStorageProvider,
} from "../../platform/storage/StorageProvider";
import { StorageBlueprintRepository } from "../../projects/repository/storageBlueprint.repository";
import { StorageGenerationHistoryRepository } from "../../projects/repository/generationHistory.repository";
import type { CreateBlueprintInput } from "../../projects/types/blueprint";
import { createProjectRuntime, createProjectsRouter } from "../projects";

async function withServer<T>(
  storage: InMemoryStorageProvider,
  auth: AuthService,
  callback: (baseUrl: string, storage: InMemoryStorageProvider) => Promise<T>,
): Promise<T> {
  const runtime = createProjectRuntime(storage, auth);
  const app = express();
  app.use(express.json());
  app.use("/projects", createProjectsRouter(runtime));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${port}/projects`, storage);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function blueprintInput(projectId: string): CreateBlueprintInput {
  return {
    project_id: projectId,
    name: "Erasure Fixture",
    description: "Blueprint erasure fixture",
    game_type: "obby",
    genre: ["adventure"],
    target_audience: "all",
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

async function setUpOwner(
  storage: InMemoryStorageProvider,
): Promise<{ auth: AuthService; token: string; userId: string }> {
  const auth = new AuthService(storage);
  await auth.registerDurable("owner@example.com", "password123", "owner");
  const login = await auth.loginDurable(
    "owner@example.com",
    "password123",
    "owner",
  );
  return { auth, token: login.token!, userId: "owner" };
}

/** Seeds a project plus one of every directly project-owned durable record. */
async function seedFullyOwnedProject(storage: InMemoryStorageProvider) {
  const projects = new SaaSProjectRepository(storage);
  const blueprints = new StorageBlueprintRepository(storage);
  const history = new StorageGenerationHistoryRepository(storage);

  const project = await projects.createDurable("owner", "Erasure", "obby");
  const blueprint = await blueprints.createBlueprint(
    "owner",
    blueprintInput(project.id),
  );
  await blueprints.saveVersion(blueprint.id, "owner", "v1");
  await blueprints.recordExecution({
    id: `exec-${project.id}`,
    blueprint_id: blueprint.id,
    project_id: project.id,
    user_id: "owner",
    status: "completed",
    started_at: new Date(),
    pipeline_steps: [],
    retry_count: 0,
  } as never);
  await blueprints.saveProposal({
    id: `proposal-${project.id}`,
    project_id: project.id,
    blueprint_id: blueprint.id,
    status: "pending",
    created_at: new Date(),
  } as never);
  await history.record({
    id: `history-${project.id}`,
    projectId: project.id,
    pipelineId: `pipeline-${project.id}`,
    status: "completed",
    startedAt: Date.now(),
    stagesCompleted: 1,
    stagesTotal: 1,
    failures: 0,
    tokenUsage: 0,
    aiCost: 0,
  });

  return { project, blueprint };
}

/** Every collection this deletion boundary owns, keyed for assertions. */
function projectOwnedCounts(storage: InMemoryStorageProvider) {
  return {
    projects: storage.count("projects"),
    blueprints: storage.count("game_blueprints"),
    versions: storage.count("blueprint_versions"),
    executions: storage.count("generation_executions"),
    proposals: storage.count("blueprint_change_proposals"),
    history: storage.count("generation_history"),
  };
}

describe("PROJECT-ERASURE-1 deletion coordinator", () => {
  it("deletes the project and every directly project-owned durable record", async () => {
    const storage = new InMemoryStorageProvider();
    const { auth, token } = await setUpOwner(storage);
    const { project } = await seedFullyOwnedProject(storage);

    expect(projectOwnedCounts(storage)).toEqual({
      projects: 1,
      blueprints: 1,
      versions: 1,
      executions: 1,
      proposals: 1,
      history: 1,
    });

    await withServer(storage, auth, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { deleted: boolean } };
      expect(body.data.deleted).toBe(true);
    });

    expect(projectOwnedCounts(storage)).toEqual({
      projects: 0,
      blueprints: 0,
      versions: 0,
      executions: 0,
      proposals: 0,
      history: 0,
    });
  });

  it("removes nothing reachable by projectId when read through fresh repository instances after 'restart'", async () => {
    const storage = new InMemoryStorageProvider();
    const { auth, token } = await setUpOwner(storage);
    const { project } = await seedFullyOwnedProject(storage);

    await withServer(storage, auth, async (baseUrl) => {
      await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
    });

    // Fresh instances over the same durable storage, as a restarted process
    // would construct: nothing here is read from a repository-local cache.
    const projectsAfterRestart = new SaaSProjectRepository(storage);
    const blueprintsAfterRestart = new StorageBlueprintRepository(storage);
    const historyAfterRestart = new StorageGenerationHistoryRepository(storage);

    expect(projectsAfterRestart.get(project.id)).toBeNull();
    expect(
      await blueprintsAfterRestart.getBlueprintByProjectId(project.id),
    ).toBeNull();
    expect(blueprintsAfterRestart.listProposals(project.id)).toEqual([]);
    expect(historyAfterRestart.getByProject(project.id)).toEqual([]);
  });

  it("is idempotent: retrying deletion after a completed erasure is a concealed no-op, not an error", async () => {
    const storage = new InMemoryStorageProvider();
    const { auth, token } = await setUpOwner(storage);
    const { project } = await seedFullyOwnedProject(storage);

    await withServer(storage, auth, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(first.status).toBe(200);

      // The project no longer exists, so the concealing access check now
      // answers exactly like it does for any unknown id: 404.
      const second = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(second.status).toBe(404);
    });
  });

  it("leaves an unknown project concealed as a 404, matching existing behavior", async () => {
    const storage = new InMemoryStorageProvider();
    const { auth, token } = await setUpOwner(storage);

    await withServer(storage, auth, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/does-not-exist`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(404);
    });
  });

  it("refuses a cross-tenant caller and leaves the project and its children intact", async () => {
    const storage = new InMemoryStorageProvider();
    const { auth, token } = await setUpOwner(storage);
    await auth.registerDurable(
      "attacker@example.com",
      "password123",
      "attacker",
    );
    const attackerLogin = await auth.loginDurable(
      "attacker@example.com",
      "password123",
      "attacker",
    );
    const { project } = await seedFullyOwnedProject(storage);
    void token;

    await withServer(storage, auth, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${attackerLogin.token}` },
      });
      // SEC-PROJECT-ACCESS-DISCLOSURE-001 concealing behavior: a foreign
      // project answers exactly like one that does not exist.
      expect(response.status).toBe(404);
    });

    expect(projectOwnedCounts(storage)).toEqual({
      projects: 1,
      blueprints: 1,
      versions: 1,
      executions: 1,
      proposals: 1,
      history: 1,
    });
  });

  it("leaves the root project and every child intact when a child cleanup fails, and retry succeeds", async () => {
    class InjectableStorage extends InMemoryStorageProvider {
      rejectNextBatch = false;

      override async applyDurableBatch(
        mutations: readonly DurableMutation[],
      ): Promise<readonly DurableMutationResult[]> {
        if (this.rejectNextBatch) {
          this.rejectNextBatch = false;
          throw new DurableStorageError(
            "injected child cleanup rejection",
            "transaction",
          );
        }
        return super.applyDurableBatch(mutations);
      }
    }

    const storage = new InjectableStorage();
    const { auth, token } = await setUpOwner(storage);
    const { project } = await seedFullyOwnedProject(storage);
    const before = projectOwnedCounts(storage);

    await withServer(storage, auth, async (baseUrl) => {
      storage.rejectNextBatch = true;
      const failed = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(failed.status).toBe(503);

      // The batch never committed: the project and every child record are
      // exactly as they were, not a partial cleanup that could be mistaken
      // for progress.
      expect(projectOwnedCounts(storage)).toEqual(before);

      const retried = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(retried.status).toBe(200);
      const body = (await retried.json()) as { data: { deleted: boolean } };
      expect(body.data.deleted).toBe(true);
    });

    expect(projectOwnedCounts(storage)).toEqual({
      projects: 0,
      blueprints: 0,
      versions: 0,
      executions: 0,
      proposals: 0,
      history: 0,
    });
  });
});
