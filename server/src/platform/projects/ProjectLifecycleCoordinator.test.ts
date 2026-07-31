import { describe, expect, it, vi } from "vitest";
import { InMemoryStorageProvider } from "../storage/StorageProvider";
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

async function createOutcomeFixture() {
  const storage = new InMemoryStorageProvider();
  await storage.setDurable("projects", "project", {
    id: "project",
    generationCount: 1,
    status: "generating",
    qualityScore: 0,
    updatedAt: 10,
  });
  await storage.setDurable("generation_executions", "execution", {
    id: "execution",
    project_id: "project",
    blueprint_id: "blueprint",
    user_id: "user",
    status: "running",
    started_at: new Date(100),
    pipeline_steps: [
      { status: "completed" },
      { status: "failed" },
    ],
  });
  return { storage, coordinator: new GenerationOutcomeCoordinator(storage) };
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
      qualityScore: 100,
    });
  });

  it("preserves all prior linked records when the durable batch rejects", async () => {
    const { storage, coordinator } = await createOutcomeFixture();
    const priorProject = storage.get("projects", "project");
    const priorExecution = storage.get("generation_executions", "execution");
    vi.spyOn(storage, "applyDurableBatch").mockRejectedValueOnce(
      new Error("injected batch rejection"),
    );

    await expect(
      coordinator.commit("execution", {
        status: "failed",
        completed_at: new Date(200),
      }),
    ).rejects.toThrow("injected batch rejection");

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
      status: "completed",
      completed_at: new Date(200),
      total_duration_ms: 100,
    };

    await coordinator.commit("execution", update);
    await coordinator.commit("execution", update);

    expect(applyBatch).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectGenerationStartCoordinator", () => {
  it("serializes project bookkeeping before scheduling generation", async () => {
    const projects = new ControlledProjectRepository(true);
    const coordinator = new ProjectGenerationStartCoordinator(projects);
    const order: string[] = [];

    const first = coordinator.start(
      "project",
      async () => {
        order.push("schedule-one");
        return "one";
      },
      async (result) => {
        order.push(`record-${result}`);
      },
    );
    await projects.firstUpdateStarted.promise;

    const second = coordinator.start(
      "project",
      async () => {
        order.push("schedule-two");
        return "two";
      },
      async (result) => {
        order.push(`record-${result}`);
      },
    );
    await Promise.resolve();

    expect(projects.updateCounts).toEqual([1]);
    expect(order).toEqual([]);

    projects.releaseFirstUpdate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(["one", "two"]);

    expect(projects.updateCounts).toEqual([1, 2]);
    expect(projects.currentCount()).toBe(2);
    expect(order).toEqual([
      "schedule-one",
      "record-one",
      "schedule-two",
      "record-two",
    ]);
  });

  it("does not resolve before generation history is acknowledged", async () => {
    const projects = new ControlledProjectRepository();
    const coordinator = new ProjectGenerationStartCoordinator(projects);
    const historyAcknowledged = deferred();
    let settled = false;

    const operation = coordinator.start(
      "project",
      async () => "execution",
      async () => {
        await historyAcknowledged.promise;
      },
    );
    void operation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    historyAcknowledged.resolve();
    await expect(operation).resolves.toBe("execution");
    expect(settled).toBe(true);
  });

  it("propagates generation history persistence rejection", async () => {
    const projects = new ControlledProjectRepository();
    const coordinator = new ProjectGenerationStartCoordinator(projects);

    await expect(
      coordinator.start(
        "project",
        async () => "execution",
        async () => {
          throw new Error("injected history write rejection");
        },
      ),
    ).rejects.toThrow("injected history write rejection");
  });

  it("does not schedule generation after rejected bookkeeping", async () => {
    const projects = new ControlledProjectRepository();
    projects.rejectNext = true;
    const coordinator = new ProjectGenerationStartCoordinator(projects);
    let scheduled = false;

    await expect(
      coordinator.start(
        "project",
        async () => {
          scheduled = true;
          return "execution";
        },
        async () => undefined,
      ),
    ).rejects.toThrow("injected project write rejection");

    expect(scheduled).toBe(false);
    expect(projects.currentCount()).toBe(0);
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
