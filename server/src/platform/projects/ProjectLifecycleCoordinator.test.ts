import { describe, expect, it } from "vitest";
import {
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
      (result) => order.push(`record-${result}`),
    );
    await projects.firstUpdateStarted.promise;

    const second = coordinator.start(
      "project",
      async () => {
        order.push("schedule-two");
        return "two";
      },
      (result) => order.push(`record-${result}`),
    );
    await Promise.resolve();

    expect(projects.updateCounts).toEqual([1]);
    expect(order).toEqual([]);

    projects.releaseFirstUpdate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([
      "one",
      "two",
    ]);

    expect(projects.updateCounts).toEqual([1, 2]);
    expect(projects.currentCount()).toBe(2);
    expect(order).toEqual([
      "schedule-one",
      "record-one",
      "schedule-two",
      "record-two",
    ]);
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
        () => undefined,
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
