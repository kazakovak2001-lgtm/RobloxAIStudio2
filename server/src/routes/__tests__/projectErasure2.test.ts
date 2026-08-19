/**
 * PROJECT-ERASURE-2 — generation_active_claims and generation_start_requests
 * are projectId-scoped durable state owned by ProjectLifecycleCoordinator,
 * and were intentionally left out of PROJECT-ERASURE-1's
 * ProjectDeletionCoordinator (#268). This proves the orphan they left behind
 * and that extending the same coordinator — not a second one — closes it.
 *
 * generation_active_claims is keyed directly by projectId. generation_start_
 * requests is keyed by an idempotency key, but every record carries the
 * projectId it was started against.
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
import { ProjectDeletionCoordinator } from "../../platform/projects/ProjectDeletionCoordinator";
import {
  generationClaimProjectDeletion,
  ProjectGenerationStartCoordinator,
} from "../../platform/projects/ProjectLifecycleCoordinator";
import { StorageBlueprintRepository } from "../../projects/repository/storageBlueprint.repository";
import { StorageGenerationHistoryRepository } from "../../projects/repository/generationHistory.repository";
import {
  DurableStorageError,
  type DurableMutation,
  type DurableMutationResult,
  InMemoryStorageProvider,
} from "../../platform/storage/StorageProvider";
import type { GenerationExecution } from "../../types/blueprint";
import { createProjectRuntime, createProjectsRouter } from "../projects";

const CLAIMS = "generation_active_claims";
const START_REQUESTS = "generation_start_requests";
const EXECUTIONS = "generation_executions";

async function withServer<T>(
  storage: InMemoryStorageProvider,
  auth: AuthService,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const runtime = createProjectRuntime(storage, auth);
  const app = express();
  app.use(express.json());
  app.use("/projects", createProjectsRouter(runtime));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${port}/projects`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function setUpOwner(
  storage: InMemoryStorageProvider,
): Promise<{ auth: AuthService; token: string }> {
  const auth = new AuthService(storage);
  await auth.registerDurable("owner@example.com", "password123", "owner");
  const login = await auth.loginDurable(
    "owner@example.com",
    "password123",
    "owner",
  );
  return { auth, token: login.token! };
}

/** Starts a real generation admission for a project: writes a claim, an
 * execution, a start-request idempotency record and increments the project's
 * generationCount, exactly as the live generation route does. */
async function startGeneration(
  storage: InMemoryStorageProvider,
  projects: SaaSProjectRepository,
  projectId: string,
  executionId: string,
  requestKey: string,
): Promise<void> {
  const coordinator = new ProjectGenerationStartCoordinator(projects, storage);
  const execution: GenerationExecution = {
    id: executionId,
    blueprint_id: `blueprint-${projectId}`,
    project_id: projectId,
    user_id: "owner",
    started_at: new Date(),
    status: "running",
    retry_count: 0,
    pipeline_steps: [],
  };

  await coordinator.start(
    projectId,
    async () => execution,
    (result) => [
      {
        operation: "set" as const,
        collection: EXECUTIONS,
        id: result.id,
        data: result,
      },
    ],
    (result) => result.id,
    undefined,
    {
      key: requestKey,
      principal: "owner",
      fingerprint: executionId,
      replay: async (id: string) => execution,
    },
  );
}

describe("PROJECT-ERASURE-2 generation claim/start-request cleanup", () => {
  it("reproduces the orphan: without the claim child, deleting a project leaves its active claim and start request behind", async () => {
    const storage = new InMemoryStorageProvider();
    const projects = new SaaSProjectRepository(storage);
    const project = await projects.createDurable("owner", "Orphan", "obby");
    await startGeneration(storage, projects, project.id, "exec-1", "key-1");

    expect(storage.get(CLAIMS, project.id)).not.toBeNull();
    expect(
      storage.list(
        START_REQUESTS,
        (r: { projectId: string }) => r.projectId === project.id,
      ),
    ).toHaveLength(1);

    // The pre-PROJECT-ERASURE-2 coordinator: blueprint + generation history
    // only, exactly what #268 shipped.
    const blueprintRepository = new StorageBlueprintRepository(storage);
    const generationHistory = new StorageGenerationHistoryRepository(storage);
    const preErasure2Coordinator = new ProjectDeletionCoordinator(storage, [
      blueprintRepository,
      generationHistory,
    ]);

    const deleted = await preErasure2Coordinator.deleteProject(project.id);
    expect(deleted).toBe(true);
    expect(projects.get(project.id)).toBeNull();

    // The project is gone, but its claim and start request are not: orphaned
    // durable data no project-scoped read path can reach again.
    expect(storage.get(CLAIMS, project.id)).not.toBeNull();
    expect(
      storage.list(
        START_REQUESTS,
        (r: { projectId: string }) => r.projectId === project.id,
      ),
    ).toHaveLength(1);
  });

  it("the extended coordinator deletes the claim and start request together with the project", async () => {
    const storage = new InMemoryStorageProvider();
    const { auth, token } = await setUpOwner(storage);
    const projects = new SaaSProjectRepository(storage);
    const project = await projects.createDurable("owner", "Cleaned", "obby");
    await startGeneration(storage, projects, project.id, "exec-1", "key-1");

    await withServer(storage, auth, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
    });

    expect(storage.get(CLAIMS, project.id)).toBeNull();
    expect(
      storage.list(
        START_REQUESTS,
        (r: { projectId: string }) => r.projectId === project.id,
      ),
    ).toHaveLength(0);
  });

  it("a claim that never released (as if generation were still active) does not block future recreation, because the id is never reused and the claim is deleted with the project", async () => {
    const storage = new InMemoryStorageProvider();
    const { auth, token } = await setUpOwner(storage);
    const projects = new SaaSProjectRepository(storage);
    const project = await projects.createDurable("owner", "InFlight", "obby");
    await startGeneration(storage, projects, project.id, "exec-1", "key-1");

    // The claim is still held — nothing released it, exactly like an
    // in-flight generation at the moment of deletion.
    expect(storage.get(CLAIMS, project.id)).not.toBeNull();

    await withServer(storage, auth, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
    });

    // A fresh coordinator instance over the same durable storage — as a
    // restarted process would construct — proves nothing here survives in a
    // repository-local cache.
    const freshChild = generationClaimProjectDeletion(storage);
    expect(await freshChild.prepareProjectDeletion(project.id)).toEqual([]);
    expect(storage.get(CLAIMS, project.id)).toBeNull();

    // A brand new project (a fresh id — ids are never reused) admits a
    // generation immediately, proving no stale claim blocks it.
    const recreated = await projects.createDurable(
      "owner",
      "Recreated",
      "obby",
    );
    await expect(
      startGeneration(storage, projects, recreated.id, "exec-2", "key-2"),
    ).resolves.toBeUndefined();
    expect(storage.get(CLAIMS, recreated.id)).not.toBeNull();
  });

  it("deleting project A does not remove claim/start-request state for project B", async () => {
    const storage = new InMemoryStorageProvider();
    const { auth, token } = await setUpOwner(storage);
    const projects = new SaaSProjectRepository(storage);
    const projectA = await projects.createDurable("owner", "A", "obby");
    const projectB = await projects.createDurable("owner", "B", "obby");
    await startGeneration(storage, projects, projectA.id, "exec-a", "key-a");
    await startGeneration(storage, projects, projectB.id, "exec-b", "key-b");

    await withServer(storage, auth, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${projectA.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
    });

    expect(storage.get(CLAIMS, projectA.id)).toBeNull();
    expect(storage.get(CLAIMS, projectB.id)).not.toBeNull();
    expect(
      storage.list(
        START_REQUESTS,
        (r: { projectId: string }) => r.projectId === projectB.id,
      ),
    ).toHaveLength(1);
    expect(projects.get(projectB.id)).not.toBeNull();
  });

  it("leaves the project, its claim and its start request intact when the batch fails, and retry converges", async () => {
    class InjectableStorage extends InMemoryStorageProvider {
      rejectNextBatch = false;

      override async applyDurableBatch(
        mutations: readonly DurableMutation[],
      ): Promise<readonly DurableMutationResult[]> {
        if (this.rejectNextBatch) {
          this.rejectNextBatch = false;
          throw new DurableStorageError(
            "injected claim-cleanup rejection",
            "transaction",
          );
        }
        return super.applyDurableBatch(mutations);
      }
    }

    const storage = new InjectableStorage();
    const { auth, token } = await setUpOwner(storage);
    const projects = new SaaSProjectRepository(storage);
    const project = await projects.createDurable("owner", "Retryable", "obby");
    await startGeneration(storage, projects, project.id, "exec-1", "key-1");

    await withServer(storage, auth, async (baseUrl) => {
      storage.rejectNextBatch = true;
      const failed = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(failed.status).toBe(503);

      // No partial cleanup: project, claim and start request all survive the
      // rejected batch exactly as they were.
      expect(projects.get(project.id)).not.toBeNull();
      expect(storage.get(CLAIMS, project.id)).not.toBeNull();
      expect(
        storage.list(
          START_REQUESTS,
          (r: { projectId: string }) => r.projectId === project.id,
        ),
      ).toHaveLength(1);

      const retried = await fetch(`${baseUrl}/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(retried.status).toBe(200);
    });

    expect(projects.get(project.id)).toBeNull();
    expect(storage.get(CLAIMS, project.id)).toBeNull();
    expect(
      storage.list(
        START_REQUESTS,
        (r: { projectId: string }) => r.projectId === project.id,
      ),
    ).toHaveLength(0);
  });
});
