import { describe, it, expect } from "vitest";
import { PipelineEngine } from "../PipelineEngine";
import { PipelineExecutor } from "../PipelineExecutor";
import { PipelineEventEmitterV2 } from "../PipelineEvents";
import {
  STAGE_ORDER,
  STAGE_AGENT_MAP,
  createPipelineState,
} from "../PipelineStage";
import type { PipelineEventData } from "../PipelineEvents";

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

    // Resume with working executor
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
});

describe("PipelineStage", () => {
  it("has correct stage order", () => {
    expect(STAGE_ORDER[0]).toBe("REQUEST");
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe("EXPORT");
    expect(STAGE_ORDER.length).toBe(11);
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
    expect(state.stages.length).toBe(11);
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
