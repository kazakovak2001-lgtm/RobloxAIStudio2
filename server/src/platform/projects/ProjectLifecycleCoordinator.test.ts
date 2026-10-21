import { describe, expect, it, vi } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
} from "../storage/StorageProvider";
import {
  GenerationOutcomeCoordinator,
  ProjectGenerationStartCoordinator,
  recordProjectOutcomeBestEffort,
} from "./ProjectLifecycleCoordinator";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class ControlledProjectRepository {
  private generationCount = 0;
  readonly updateCounts: number[] = [];
  readonly firstUpdateStarted = deferred();
  readonly releaseFirstUpdate = deferred();
  rejectNext = false;

  constructor(private readonly holdFirstUpdate = false) {}

  get(projectId: string) {
    return projectId === "project"
      ? { generationCount: this.generationCount }
      : null;
  }

  async updateDurable(
    projectId: string,
    updates: { status: "generating"; generationCount: number },
  ) {
    if (projectId !== "project") return null;
    this.updateCounts.push(updates.generationCount);
    if (this.updateCounts.length === 1 && this.holdFirstUpdate) {
      this.firstUpdateStarted.resolve();
      await this.releaseFirstUpdate.promise;
    }
    if (this.rejectNext) {
      this.rejectNext = false;
      throw new Error("injected project write rejection");
    }
    this.generationCount = updates.generationCount;
    return { generationCount: this.generationCount };
  }

  currentCount() {
    return this.generationCount;
  }
}

class FailingBatchStorage extends InMemoryStorageProvider {
  override async applyDurableBatch(mutations: readonly DurableMutation[]) {
    return super.applyDurableBatch([
      ...mutations,
      {
        operation: "set",
        collection: "invalid",
        id: "",
        data: null,
      },
    ]);
  }
}

async function createOutcomeFixture(
  storage: InMemoryStorageProvider = new InMemoryStorageProvider(),
) {
  await storage.setDurable("projects", "project", {
    id: "project",
    generationCount: 1,
    status: "generating",
    qualityScore: 40,
    updatedAt: 10,
  });
  await storage.setDurable("generation_executions", "execution", {
    id: "execution",
    project_id: "project",
    blueprint_id: "blueprint",
    user_id: "user",
    status: "running",
    started_at: new Date(100),
    retry_count: 0,
    pipeline_steps: [
      {
        agent: "builder",
        status: "completed",
        evaluation: {
          qualityScore: 80,
          status: "passed",
          issueCount: 0,
          durationMs: 10,
        },
      },
      {
        agent: "validator",
        status: "failed",
        evaluation: {
          qualityScore: 60,
          status: "failed",
          issueCount: 1,
          durationMs: 10,
        },
      },
    ],
  });
  return {
    storage,
    coordinator: new GenerationOutcomeCoordinator(storage),
  };
}

describe("GenerationOutcomeCoordinator", () => {
  it("publishes execution, history and project state in one durable batch", async () => {
    const { storage, coordinator } = await createOutcomeFixture();
    const applyBatch = vi.spyOn(storage, "applyDurableBatch");

    await expect(
      coordinator.commit("execution", {
        status: "completed",
        completed_at: new Date(200),
        total_duration_ms: 100,
      }),
    ).resolves.toMatchObject({ status: "completed" });

    expect(applyBatch).toHaveBeenCalledTimes(1);
    expect(storage.get("generation_executions", "execution")).toMatchObject({
      status: "completed",
      total_duration_ms: 100,
    });
    expect(storage.get("generation_history", "execution")).toEqual({
      id: "execution",
      projectId: "project",
      pipelineId: "execution",
      status: "completed",
      startedAt: 100,
      finishedAt: 200,
      duration: 100,
      stagesCompleted: 1,
      stagesTotal: 2,
      failures: 1,
      tokenUsage: 0,
      aiCost: 0,
    });
    expect(storage.get("projects", "project")).toMatchObject({
      status: "ready",
      qualityScore: 70,
    });
  });

  it("preserves all prior linked records when staged batch processing fails", async () => {
    const storage = new FailingBatchStorage();
    const { coordinator } = await createOutcomeFixture(storage);
    const priorProject = structuredClone(storage.get("projects", "project"));
    const priorExecution = structuredClone(
      storage.get("generation_executions", "execution"),
    );

    await expect(
      coordinator.commit("execution", {
        status: "failed",
        completed_at: new Date(200),
      }),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.get("projects", "project")).toEqual(priorProject);
    expect(storage.get("generation_executions", "execution")).toEqual(
      priorExecution,
    );
    expect(storage.get("generation_history", "execution")).toBeNull();
  });

  it("treats repeated identical terminal delivery as idempotent", async () => {
    const { storage, coordinator } = await createOutcomeFixture();
    const applyBatch = vi.spyOn(storage, "applyDurableBatch");
    const update = {
      status: "completed" as const,
      completed_at: new Date(200),
      total_duration_ms: 100,
    };

    await coordinator.commit("execution", update);
    await coordinator.commit("execution", update);

    expect(applyBatch).toHaveBeenCalledTimes(1);
  });

  it("enriches a matching terminal redelivery with newer outcome fields", async () => {
    const { storage, coordinator } = await createOutcomeFixture();

    await coordinator.commit("execution", {
      status: "failed",
      completed_at: new Date(200),
    });
    await coordinator.commit("execution", {
      status: "failed",
      completed_at: new Date(250),
      total_duration_ms: 150,
      error_message: "detailed failure",
    });

    expect(storage.get("generation_executions", "execution")).toMatchObject({
      status: "failed",
      total_duration_ms: 150,
      error_message: "detailed failure",
    });
  });

  it("rejects conflicting terminal redelivery without rewriting linked state", async () => {
    const { storage, coordinator } = await createOutcomeFixture();
    await coordinator.commit("execution", {
      status: "completed",
      completed_at: new Date(200),
    });
    const project = structuredClone(storage.get("projects", "project"));
    const history = structuredClone(
      storage.get("generation_history", "execution"),
    );

    await expect(
      coordinator.commit("execution", { status: "failed" }),
    ).rejects.toMatchObject({ code: "DURABLE_STORAGE_CONFLICT" });
    expect(storage.get("projects", "project")).toEqual(project);
    expect(storage.get("generation_history", "execution")).toEqual(history);
  });

  it("hydrates persisted ISO dates before finalizing a recovered execution", async () => {
    const { storage, coordinator } = await createOutcomeFixture();
    const execution = storage.get<Record<string, unknown>>(
      "generation_executions",
      "execution",
    );
    storage.set("generation_executions", "execution", {
      ...execution,
      started_at: new Date(100).toISOString(),
    });

    await expect(
      coordinator.commit("execution", {
        status: "completed",
        completed_at: new Date(200),
      }),
    ).resolves.toMatchObject({ started_at: new Date(100) });
  });
});

/**
 * AUDIT-START-ATOMICITY-001 changed this contract: start evidence now commits
 * as one `applyDurableBatch` rather than three independent durable writes, so
 * `prepare` runs before any project mutation and `afterCommit` runs only once
 * the transaction has committed. The four cases below carry the same intents as
 * the pre-fix versions — serialization, no premature resolution, persistence
 * errors surfacing, and no work started when bookkeeping fails — restated
 * against the transactional contract.
 */
describe("ProjectGenerationStartCoordinator", () => {
  const PROJECT = "project";
  const PROJECTS_COLLECTION = "projects";

  interface StoredProject {
    id: string;
    generationCount: number;
    status: string;
  }

  function startFixture(
    storage: InMemoryStorageProvider = new InMemoryStorageProvider(),
  ) {
    storage.set<StoredProject>(PROJECTS_COLLECTION, PROJECT, {
      id: PROJECT,
      generationCount: 0,
      status: "draft",
    });
    const projects = {
      get: (projectId: string) =>
        storage.get<StoredProject>(PROJECTS_COLLECTION, projectId),
      // The standalone project write must be gone: start commits in one batch.
      updateDurable: async () => {
        throw new Error("updateDurable must not be used by start()");
      },
    };
    return {
      storage,
      coordinator: new ProjectGenerationStartCoordinator(projects, storage),
      project: () => storage.get<StoredProject>(PROJECTS_COLLECTION, PROJECT),
    };
  }

  const evidenceFor = (id: string): readonly DurableMutation[] => [
    {
      operation: "set",
      collection: "generation_executions",
      id,
      data: { id, status: "running" },
    },
    {
      operation: "set",
      collection: "generation_history",
      id,
      data: { pipelineId: id, projectId: PROJECT },
    },
  ];

  // AUDIT-DUP-GENERATION-001 changed this contract deliberately. It previously
  // asserted that two concurrent starts both succeed and increment the count
  // twice, which was the duplicate-generation defect stated as an expectation.
  // Serialization is still asserted; what changed is that the second start is
  // now refused rather than admitted.
  it("serializes concurrent starts and refuses the duplicate", async () => {
    const { coordinator, project } = startFixture();
    const order: string[] = [];

    const first = coordinator.start(
      PROJECT,
      async () => {
        order.push("prepare-one");
        return "one";
      },
      (id) => evidenceFor(id),
      (id) => String(id),
      (id) => order.push(`enqueue-${id}`),
    );
    const second = coordinator.start(
      PROJECT,
      async () => {
        order.push("prepare-two");
        return "two";
      },
      (id) => evidenceFor(id),
      (id) => String(id),
      (id) => order.push(`enqueue-${id}`),
    );

    const results = await Promise.allSettled([first, second]);
    expect(results[0]).toMatchObject({ status: "fulfilled", value: "one" });
    expect(results[1]).toMatchObject({ status: "rejected" });

    // Serialized: the second start never interleaves inside the first, and it
    // never reaches the enqueue step because its transaction was rejected.
    expect(order).toEqual(["prepare-one", "enqueue-one", "prepare-two"]);
    expect(project()?.generationCount).toBe(1);
    expect(project()?.status).toBe("generating");
  });

  it("does not resolve before the durable start evidence is acknowledged", async () => {
    const release = deferred();
    class GatedStorage extends InMemoryStorageProvider {
      override async applyDurableBatch(mutations: readonly DurableMutation[]) {
        await release.promise;
        return super.applyDurableBatch(mutations);
      }
    }
    const { coordinator } = startFixture(new GatedStorage());
    let settled = false;

    const operation = coordinator.start(
      PROJECT,
      async () => "execution",
      (id) => evidenceFor(id),
      (id) => String(id),
    );
    void operation.then(
      () => (settled = true),
      () => (settled = true),
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    release.resolve();
    await expect(operation).resolves.toBe("execution");
    expect(settled).toBe(true);
  });

  it("propagates start evidence persistence rejection", async () => {
    const { coordinator } = startFixture(new FailingBatchStorage());

    await expect(
      coordinator.start(
        PROJECT,
        async () => "execution",
        (id) => evidenceFor(id),
        (id) => String(id),
        (id) => String(id),
      ),
    ).rejects.toThrow();
  });

  it("does not start generation work when bookkeeping fails to commit", async () => {
    const { coordinator, storage, project } = startFixture(
      new FailingBatchStorage(),
    );
    let enqueued = false;

    await expect(
      coordinator.start(
        PROJECT,
        async () => "execution",
        (id) => evidenceFor(id),
        (id) => String(id),
        (id) => String(id),
        () => {
          enqueued = true;
        },
      ),
    ).rejects.toThrow();

    // The whole transaction rolled back: no work started, no false state.
    expect(enqueued).toBe(false);
    expect(project()?.generationCount).toBe(0);
    expect(project()?.status).toBe("draft");
    expect(storage.get("generation_executions", "execution")).toBeNull();
    expect(storage.get("generation_history", "execution")).toBeNull();
  });
});

describe("recordProjectOutcomeBestEffort", () => {
  it("records the outcome despite project persistence failure", async () => {
    const order: string[] = [];
    const rejection = new Error("injected outcome rejection");

    await expect(
      recordProjectOutcomeBestEffort(
        () => order.push("record"),
        async () => {
          order.push("persist");
          throw rejection;
        },
        (error) => {
          expect(error).toBe(rejection);
          order.push("report");
        },
      ),
    ).resolves.toBeUndefined();

    expect(order).toEqual(["record", "persist", "report"]);
  });
});
