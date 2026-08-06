import { describe, expect, it } from "vitest";
import { TaskGraph } from "../model/TaskGraph";
import { PlanExecutor } from "./PlanExecutor";

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
