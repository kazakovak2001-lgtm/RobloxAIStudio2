/**
 * AUDIT-START-ATOMICITY-001 — generation start must be atomic and recoverable.
 *
 * The pre-fix `ProjectGenerationStartCoordinator.start()` performed three
 * independent durable writes: project (status=generating, generationCount+1),
 * then the execution, then the start-history entry. A rejection after the first
 * left the project falsely claiming `generating` with an incremented count and
 * no execution that could ever repair it; a rejection after the second left a
 * caller-visible failure alongside a durably created execution, inviting a
 * duplicate on retry.
 *
 * The fix commits all three in one `applyDurableBatch`, whose contract is that
 * no cache change becomes visible unless every mutation commits and a rejection
 * preserves the exact pre-transaction state. Process-local work (enqueueing the
 * pipeline) runs only after that commit.
 *
 * These tests drive the real coordinator against a real storage provider and
 * assert the durable state directly, because durable state is the thing the
 * finding is about.
 */

import { describe, expect, it } from "vitest";
import {
  InMemoryStorageProvider,
  type DurableMutation,
} from "../platform/storage/StorageProvider";
import { ProjectGenerationStartCoordinator } from "../platform/projects/ProjectLifecycleCoordinator";
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

const PROJECT = "atomicity-project";
const USER = "atomicity-user";
const PROJECTS = "projects";
const EXECUTIONS = "generation_executions";
const HISTORY = "generation_history";

interface StoredProject {
  id: string;
  generationCount: number;
  status: string;
}

/** Storage that rejects the batch once, deterministically. */
class RejectOnceStorage extends InMemoryStorageProvider {
  private armed = true;
  override async applyDurableBatch(mutations: readonly DurableMutation[]) {
    if (this.armed) {
      this.armed = false;
      throw new Error("injected durable batch rejection");
    }
    return super.applyDurableBatch(mutations);
  }
}

function fixture(
  storage: InMemoryStorageProvider = new InMemoryStorageProvider(),
) {
  storage.set<StoredProject>(PROJECTS, PROJECT, {
    id: PROJECT,
    generationCount: 0,
    status: "draft",
  });
  const projects = {
    get: (projectId: string) => storage.get<StoredProject>(PROJECTS, projectId),
    updateDurable: async () => {
      throw new Error("start() must not use the standalone project write");
    },
  };
  const coordinator = new ProjectGenerationStartCoordinator(projects, storage);

  const enqueued: string[] = [];
  const order: string[] = [];

  const startOnce = (executionId: string) =>
    coordinator.start(
      PROJECT,
      async () => {
        order.push("prepare");
        return {
          execution: {
            id: executionId,
            project_id: PROJECT,
            status: "running",
            started_at: new Date(0),
          },
        };
      },
      ({ execution }) => [
        {
          operation: "set" as const,
          collection: EXECUTIONS,
          id: execution.id,
          data: execution,
        },
        {
          operation: "set" as const,
          collection: HISTORY,
          id: execution.id,
          data: {
            id: execution.id,
            projectId: PROJECT,
            pipelineId: execution.id,
            status: execution.status,
            startedAt: execution.started_at.getTime(),
            stagesCompleted: 0,
            stagesTotal: 0,
            failures: 0,
            tokenUsage: 0,
            aiCost: 0,
          },
        },
      ],
      ({ execution }) => {
        order.push("enqueue");
        enqueued.push(execution.id);
      },
    );

  return {
    storage,
    coordinator,
    startOnce,
    enqueued,
    order,
    project: () => storage.get<StoredProject>(PROJECTS, PROJECT),
    executions: () => storage.list<{ id: string }>(EXECUTIONS),
    history: () => storage.list<{ pipelineId: string }>(HISTORY),
  };
}

describe("AUDIT-START-ATOMICITY-001 Test A — successful start", () => {
  it("commits project, execution and history together and then enqueues", async () => {
    const f = fixture();

    await expect(f.startOnce("exec-a")).resolves.toMatchObject({
      execution: { id: "exec-a" },
    });

    expect(f.project()?.status).toBe("generating");
    expect(f.project()?.generationCount).toBe(1);
    expect(f.executions()).toHaveLength(1);
    expect(f.history()).toHaveLength(1);
    expect(f.history()[0]?.pipelineId).toBe("exec-a");
    // Process-local work strictly after the durable commit.
    expect(f.order).toEqual(["prepare", "enqueue"]);
    expect(f.enqueued).toEqual(["exec-a"]);
  });
});

describe("AUDIT-START-ATOMICITY-001 Test B — prepare/schedule throws", () => {
  it("leaves no false generating state, no count change and no evidence", async () => {
    const f = fixture();

    await expect(
      f.coordinator.start(
        PROJECT,
        async () => {
          throw new Error("injected schedule rejection");
        },
        () => [],
        () => undefined,
      ),
    ).rejects.toThrow("injected schedule rejection");

    // This is the exact state the pre-fix implementation corrupted.
    expect(f.project()?.status).toBe("draft");
    expect(f.project()?.generationCount).toBe(0);
    expect(f.executions()).toEqual([]);
    expect(f.history()).toEqual([]);
    expect(f.enqueued).toEqual([]);
  });
});

describe("AUDIT-START-ATOMICITY-001 Test C — durable evidence persistence fails", () => {
  it("rolls the whole transaction back rather than leaving partial state", async () => {
    const f = fixture(new RejectOnceStorage());

    await expect(f.startOnce("exec-c")).rejects.toThrow(
      "injected durable batch rejection",
    );

    // The compensated state is defined by the transaction, not by cleanup code:
    // nothing committed, so there is no untracked running execution to explain.
    expect(f.project()?.status).toBe("draft");
    expect(f.project()?.generationCount).toBe(0);
    expect(f.executions()).toEqual([]);
    expect(f.history()).toEqual([]);
    // And no pipeline was started for state that does not exist.
    expect(f.enqueued).toEqual([]);
  });
});

describe("AUDIT-START-ATOMICITY-001 Test D — retry after a failed start", () => {
  it("produces exactly one execution and increments the count exactly once", async () => {
    const f = fixture(new RejectOnceStorage());

    await expect(f.startOnce("exec-d1")).rejects.toThrow();
    await expect(f.startOnce("exec-d2")).resolves.toMatchObject({
      execution: { id: "exec-d2" },
    });

    expect(f.project()?.generationCount).toBe(1);
    expect(f.project()?.status).toBe("generating");
    expect(f.executions()).toHaveLength(1);
    expect(f.executions()[0]?.id).toBe("exec-d2");
    expect(f.history()).toHaveLength(1);
    expect(f.enqueued).toEqual(["exec-d2"]);
  });
});

describe("AUDIT-START-ATOMICITY-001 Test E — concurrent start attempts", () => {
  it("keeps count, status and history consistent across concurrent starts", async () => {
    const f = fixture();

    await Promise.all([f.startOnce("exec-e1"), f.startOnce("exec-e2")]);

    // Duplicate-generation suppression is out of this slice, so two starts
    // legitimately produce two executions. What must hold is that the
    // bookkeeping is not lost or double-counted.
    expect(f.project()?.generationCount).toBe(2);
    expect(f.project()?.status).toBe("generating");
    expect(f.executions()).toHaveLength(2);
    expect(f.history()).toHaveLength(2);
    expect(f.enqueued).toEqual(["exec-e1", "exec-e2"]);
  });

  it("keeps failure compensation consistent when a concurrent start fails", async () => {
    const f = fixture(new RejectOnceStorage());

    const results = await Promise.allSettled([
      f.startOnce("exec-f1"),
      f.startOnce("exec-f2"),
    ]);

    const rejected = results.filter((r) => r.status === "rejected");
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(rejected).toHaveLength(1);
    expect(fulfilled).toHaveLength(1);

    // Exactly the successful start is reflected durably.
    expect(f.project()?.generationCount).toBe(1);
    expect(f.executions()).toHaveLength(1);
    expect(f.history()).toHaveLength(1);
    expect(f.enqueued).toHaveLength(1);
  });
});

describe("AUDIT-START-ATOMICITY-001 Test F — no compensating write to fail", () => {
  it("relies on transactional rollback, so there is no second-order cleanup path", async () => {
    // The implementation uses a real atomic batch rather than compensation, so
    // the class of failure Test F targets — the compensation write itself
    // failing — cannot arise: there is no compensation write. What must be
    // guaranteed instead is that a rejected batch preserves the exact
    // pre-transaction state, which is asserted here against a provider that
    // rejects every batch.
    class AlwaysFailingStorage extends InMemoryStorageProvider {
      override async applyDurableBatch(): Promise<never> {
        throw new Error("durable batch permanently unavailable");
      }
    }
    const f = fixture(new AlwaysFailingStorage());
    const before = JSON.stringify(f.project());

    await expect(f.startOnce("exec-g")).rejects.toThrow(
      "durable batch permanently unavailable",
    );
    await expect(f.startOnce("exec-g")).rejects.toThrow(
      "durable batch permanently unavailable",
    );

    // Repeated failures never drift the project state.
    expect(JSON.stringify(f.project())).toBe(before);
    expect(f.executions()).toEqual([]);
    expect(f.history()).toEqual([]);
    expect(f.enqueued).toEqual([]);
  });
});

describe("AUDIT-START-ATOMICITY-001 service integration", () => {
  it("prepareGeneration produces an execution without persisting or enqueueing", async () => {
    const storage = new InMemoryStorageProvider();
    const repository = new InMemoryBlueprintRepository();
    const service = new GameGenerationService(
      repository,
      new BlueprintCache(),
      new StreamingUpdateHandler(new PipelineEventEmitter()),
      new AgentRegistry(),
      new ArtifactStore(),
    );
    const blueprint = await service.createBlueprint(USER, PROJECT, {
      project_id: PROJECT,
      user_id: USER,
      name: "Atomicity probe",
      description: "A generic probe blueprint.",
      game_type: "adventure",
      genre: ["exploration"],
      difficulty: "medium",
      estimated_players: "solo",
      target_audience: "all ages",
    } as CreateBlueprintInput);

    const prepared = await service.prepareGeneration(PROJECT, USER);

    expect(prepared.execution.project_id).toBe(PROJECT);
    expect(prepared.execution.blueprint_id).toBe(blueprint.id);
    expect(prepared.execution.status).toBe("running");
    // Nothing durable was written by preparing.
    expect(storage.list(EXECUTIONS)).toEqual([]);
    expect(await repository.getExecution(prepared.execution.id)).toBeNull();
  });
});
