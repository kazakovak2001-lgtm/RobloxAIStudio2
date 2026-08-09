import { describe, expect, it, vi } from "vitest";
import { PipelineEngine } from "../PipelineEngine";
import { PipelineExecutor } from "../PipelineExecutor";
import { PipelineEventEmitterV2 } from "../PipelineEvents";
import {
  STAGE_ORDER,
  STAGE_AGENT_MAP,
  createPipelineState,
} from "../PipelineStage";
import type { PipelineEventData } from "../PipelineEvents";
import { InMemoryPipelineStore } from "../store/InMemoryPipelineStore";

const mockExecutor = async (
  agentId: string,
  input: Record<string, unknown>,
) => {
  return {
    [`${agentId}_result`]: "generated",
    inputKeys: Object.keys(input).length,
  };
};

const failingExecutor = async (
  agentId: string,
  _input: Record<string, unknown>,
) => {
  if (agentId === "lua_generator") throw new Error("Lua generation failed");
  return { [`${agentId}_result`]: "ok" };
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class DeferredRecoveryStore extends InMemoryPipelineStore {
  readonly recovery = deferred();
  recoveryCalls = 0;

  override async markInterrupted(): Promise<number> {
    this.recoveryCalls += 1;
    await this.recovery.promise;
    return 0;
  }
}

describe("PipelineEngine", () => {
  it("runs complete pipeline successfully", async () => {
    const engine = new PipelineEngine();
    const result = await engine.run(
      "proj-1",
      { name: "Test", genre: "obby" },
      mockExecutor,
    );
    expect(result.state.status).toBe("completed");
    expect(result.state.completedStages.length).toBe(STAGE_ORDER.length);
    expect(result.state.failedStages.length).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("stops on failure and records failed stage", async () => {
    const engine = new PipelineEngine();
    const result = await engine.run(
      "proj-1",
      { name: "Fail" },
      failingExecutor,
    );
    expect(result.state.status).toBe("failed");
    expect(result.state.failedStages).toContain("LUA_GENERATION");
    expect(result.state.completedStages).toContain("REQUIREMENTS");
    expect(result.state.completedStages).not.toContain("LUA_GENERATION");
  });

  it("resumes from failed stage", async () => {
    const engine = new PipelineEngine();
    const failResult = await engine.run(
      "proj-1",
      { name: "Resume" },
      failingExecutor,
    );
    expect(failResult.state.status).toBe("failed");

    const resumed = await engine.resume(
      failResult.state.pipelineId,
      { name: "Resume" },
      mockExecutor,
    );
    expect(resumed).not.toBeNull();
    expect(resumed!.state.status).toBe("completed");
    expect(resumed!.state.completedStages.length).toBe(STAGE_ORDER.length);
  });

  it("emits events for all stages", async () => {
    const engine = new PipelineEngine();
    const events: PipelineEventData[] = [];
    engine.onEvent((e) => events.push(e));
    await engine.run("proj-1", { name: "Events" }, mockExecutor);
    expect(events.some((e) => e.type === "pipeline.started")).toBe(true);
    expect(events.some((e) => e.type === "pipeline.completed")).toBe(true);
    expect(events.filter((e) => e.type === "stage.completed").length).toBe(
      STAGE_ORDER.length,
    );
  });

  it("blocks pipeline mutation until startup recovery completes", async () => {
    const store = new DeferredRecoveryStore();
    const engine = new PipelineEngine({ store });
    let executed = false;

    const start = engine.startAsync(
      "recovery-blocked-project",
      { name: "Recovery blocked" },
      async () => {
        executed = true;
        return { generated: true };
      },
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(store.recoveryCalls).toBe(1);
    expect(engine.runCount).toBe(0);
    expect(executed).toBe(false);

    store.recovery.resolve();
    const pipelineId = await start;
    await vi.waitFor(() => expect(executed).toBe(true));

    expect(pipelineId).toMatch(/^pipeline-/);
    expect(engine.runCount).toBe(1);
  });

  it("does not publish or execute before start reservation acknowledgement", async () => {
    const engine = new PipelineEngine();
    const reservation = deferred();
    let executed = false;

    const start = engine.startAsync(
      "reserved-project",
      { name: "Reserved" },
      async () => {
        executed = true;
        return { generated: true };
      },
      async () => reservation.promise,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.runCount).toBe(0);
    expect(executed).toBe(false);

    reservation.resolve();
    const pipelineId = await start;
    await vi.waitFor(() => expect(executed).toBe(true));

    expect(pipelineId).toMatch(/^pipeline-/);
    expect(engine.runCount).toBe(1);
  });

  it("does not launch a pipeline when start reservation rejects", async () => {
    const engine = new PipelineEngine();
    let executed = false;

    await expect(
      engine.startAsync(
        "rejected-project",
        { name: "Rejected" },
        async () => {
          executed = true;
          return { generated: true };
        },
        async () => {
          throw new Error("injected reservation rejection");
        },
      ),
    ).rejects.toThrow("injected reservation rejection");

    expect(engine.runCount).toBe(0);
    expect(executed).toBe(false);
  });

  it("shares one reservation across concurrent starts for a project", async () => {
    const engine = new PipelineEngine();
    await engine.ready();
    const reservation = deferred();
    let reservationCalls = 0;

    const reserve = async () => {
      reservationCalls += 1;
      await reservation.promise;
    };
    const first = engine.startAsync(
      "concurrent-project",
      { name: "Concurrent" },
      mockExecutor,
      reserve,
    );
    const second = engine.startAsync(
      "concurrent-project",
      { name: "Concurrent" },
      mockExecutor,
      reserve,
    );
    await Promise.resolve();

    expect(reservationCalls).toBe(1);
    expect(engine.runCount).toBe(0);

    reservation.resolve();
    const [firstPipelineId, secondPipelineId] = await Promise.all([
      first,
      second,
    ]);

    expect(secondPipelineId).toBe(firstPipelineId);
    expect(engine.runCount).toBe(1);
  });
});

describe("PipelineStage", () => {
  it("has correct stage order", () => {
    expect(STAGE_ORDER[0]).toBe("REQUEST");
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe("EXPORT");
    expect(STAGE_ORDER.length).toBe(13);
    // WORLD-1A derives a world model from earlier claims, so it must sit after
    // the stages that make them and before the validation that checks them.
    expect(STAGE_ORDER.indexOf("WORLD_MODEL")).toBeGreaterThan(
      STAGE_ORDER.indexOf("ARCHITECTURE"),
    );
    expect(STAGE_ORDER.indexOf("WORLD_MODEL")).toBeLessThan(
      STAGE_ORDER.indexOf("VALIDATION"),
    );
    // SECREVIEW-1 reviews generated Lua, so it must sit after the stage that
    // produces it and before the export that ships it.
    expect(STAGE_ORDER.indexOf("SECURITY_REVIEW")).toBeGreaterThan(
      STAGE_ORDER.indexOf("LUA_GENERATION"),
    );
    expect(STAGE_ORDER.indexOf("SECURITY_REVIEW")).toBeLessThan(
      STAGE_ORDER.indexOf("EXPORT"),
    );
  });

  it("maps agents correctly", () => {
    expect(STAGE_AGENT_MAP.REQUIREMENTS).toBe("requirements");
    expect(STAGE_AGENT_MAP.LUA_GENERATION).toBe("lua_generator");
    expect(STAGE_AGENT_MAP.REQUEST).toBeNull();
    expect(STAGE_AGENT_MAP.EXPORT).toBeNull();
  });

  it("creates valid initial state", () => {
    const state = createPipelineState("proj-1");
    expect(state.pipelineId).toMatch(/^pipeline-/);
    expect(state.status).toBe("pending");
    expect(state.stages.length).toBe(13);
    expect(state.completedStages).toHaveLength(0);
  });
});

describe("PipelineEventEmitterV2", () => {
  it("emits and records events", () => {
    const emitter = new PipelineEventEmitterV2();
    const received: PipelineEventData[] = [];
    emitter.on((e) => received.push(e));
    emitter.emit({
      type: "pipeline.started",
      pipelineId: "p1",
      projectId: "proj",
      timestamp: Date.now(),
    });
    expect(received.length).toBe(1);
    expect(emitter.getHistory().length).toBe(1);
  });
});
