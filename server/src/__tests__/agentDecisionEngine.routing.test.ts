import { describe, expect, it } from "vitest";
import { AgentDecisionEngine } from "../core/agents/AgentDecisionEngine";

function record(
  engine: AgentDecisionEngine,
  agent: string,
  taskType: string,
  success: boolean,
  quality: number,
  durationMs: number,
): void {
  engine.recordExecution({
    agent,
    taskType,
    executionId: `exec-${agent}-${taskType}`,
    nodeId: `node-${agent}-${taskType}`,
    success,
    quality,
    durationMs,
    contextKeys: ["blueprint"],
    timestamp: Date.now(),
  });
}

describe("AgentDecisionEngine canonical routing safety", () => {
  it("preserves the planner assignment when no exact task-type evidence exists", () => {
    const engine = new AgentDecisionEngine();
    record(engine, "requirements", "analysis", true, 95, 10);

    const selection = engine.selectAgent({
      taskType: "generation",
      assignedAgent: "lua_generator",
      availableAgents: [
        "requirements",
        "planner",
        "lua_generator",
        "ui_generator",
      ],
      contextKeys: ["blueprint"],
    });

    expect(selection.selectedAgent).toBe("lua_generator");
    expect(selection.selectionReason).toContain("preserving plan assignment");
  });

  it("allows adaptive selection only after both agents have exact task evidence", () => {
    const engine = new AgentDecisionEngine();
    record(engine, "lua_generator", "generation", false, 10, 30_000);
    record(engine, "requirements", "generation", true, 100, 10);

    const selection = engine.selectAgent({
      taskType: "generation",
      assignedAgent: "lua_generator",
      availableAgents: ["requirements", "lua_generator"],
      contextKeys: ["blueprint"],
    });

    expect(selection.selectedAgent).toBe("requirements");
  });
});
