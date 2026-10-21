import { describe, expect, it } from "vitest";
import { TaskGraph } from "../model/TaskGraph";
import {
  PLAN_NODE_MAX_ATTEMPTS,
  PlanExecutor,
  boundPlanNodeAttempts,
} from "./PlanExecutor";

describe("PlanExecutor failed agent contract", () => {
  it("marks a structured agent failure as a failed node", async () => {
    const graph = new TaskGraph("generate playable game");
    graph.addNode({
      id: "lua",
      agent: "lua_generator",
      type: "generation",
      input: {},
      dependencies: [],
      status: "pending",
      priority: 1,
    });

    const result = await new PlanExecutor().executePlan(
      "exec-failed-agent",
      graph,
      async () => ({ _failed: true, _error: "Lua output is not playable" }),
      { maxRetries: 1, stopOnFailure: false },
    );

    expect(result.success).toBe(false);
    expect(result.failedNodes).toBe(1);
    expect(graph.getNode("lua")).toMatchObject({
      status: "failed",
      error: "Lua output is not playable",
    });
  });
});

describe("SEC-PLAN-RETRY-CEILING-001 plan node attempts", () => {
  function failingGraph() {
    const graph = new TaskGraph("generate playable game");
    graph.addNode({
      id: "lua",
      agent: "lua_generator",
      type: "generation",
      input: {},
      dependencies: [],
      status: "pending",
      priority: 1,
    });
    return graph;
  }

  async function attemptsFor(maxRetries: unknown) {
    let calls = 0;
    await new PlanExecutor().executePlan(
      "exec-retry-ceiling",
      failingGraph(),
      async () => {
        calls++;
        return { _failed: true, _error: "always fails" };
      },
      { maxRetries: maxRetries as number, stopOnFailure: false },
    );
    return calls;
  }

  it("never calls an agent more than three times however many retries a caller asks for", async () => {
    expect(await attemptsFor(1_000_000)).toBe(3);
    expect(await attemptsFor(Number.MAX_SAFE_INTEGER)).toBe(3);
  });

  it("lets a caller narrow the attempts", async () => {
    expect(await attemptsFor(1)).toBe(1);
    expect(await attemptsFor(2)).toBe(2);
  });

  it("treats non-numeric, non-finite or non-positive requests as a single attempt", async () => {
    expect(await attemptsFor("1000000")).toBe(1);
    expect(await attemptsFor(Number.POSITIVE_INFINITY)).toBe(1);
    expect(await attemptsFor(Number.NaN)).toBe(1);
    expect(await attemptsFor(0)).toBe(1);
    expect(await attemptsFor(-5)).toBe(1);
  });

  it("pins the literal ceiling", () => {
    expect(PLAN_NODE_MAX_ATTEMPTS).toBe(3);
    expect(boundPlanNodeAttempts(2.9)).toBe(2);
  });
});
