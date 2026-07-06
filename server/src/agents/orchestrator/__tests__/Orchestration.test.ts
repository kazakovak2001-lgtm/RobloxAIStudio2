/**
 * Multi-Agent Orchestration Integration Tests (v2.7)
 */

import { describe, it, expect } from "vitest";
import { AgentOrchestrator } from "../AgentOrchestrator";
import { CapabilityRegistry } from "../CapabilityRegistry";
import { AgentDependencyPlanner } from "../AgentDependencyPlanner";
import { AgentMessageBus } from "../AgentMessageBus";
import { SharedAgentContext } from "../SharedAgentContext";
import { AgentExecutionValidator } from "../AgentExecutionValidator";
import { BaseAgentV2, type AgentInput, type AgentOutput } from "../BaseAgentV2";
import type { AgentCapability } from "../types";

// Mock agents
class MockGameplayAgent extends BaseAgentV2 {
  readonly agentId = "gameplay-agent";
  readonly capability: AgentCapability = {
    id: "cap-gameplay",
    agentId: "gameplay-agent",
    supportedTasks: ["generate", "*"],
    requiredInputs: ["intent"],
    producedOutputs: ["gameplay"],
    dependencies: [],
    priority: 1,
  };
  async execute(_input: AgentInput): Promise<AgentOutput> {
    return {
      agentId: this.agentId,
      success: true,
      outputs: { gameplay: { mechanics: ["jump"] } },
      durationMs: 5,
    };
  }
}

class MockLuaAgent extends BaseAgentV2 {
  readonly agentId = "lua-agent";
  readonly capability: AgentCapability = {
    id: "cap-lua",
    agentId: "lua-agent",
    supportedTasks: ["generate", "*"],
    requiredInputs: ["gameplay"],
    producedOutputs: ["scripts"],
    dependencies: ["gameplay-agent"],
    priority: 2,
  };
  async execute(_input: AgentInput): Promise<AgentOutput> {
    return {
      agentId: this.agentId,
      success: true,
      outputs: { scripts: ["main.lua"] },
      durationMs: 3,
    };
  }
}

class MockUIAgent extends BaseAgentV2 {
  readonly agentId = "ui-agent";
  readonly capability: AgentCapability = {
    id: "cap-ui",
    agentId: "ui-agent",
    supportedTasks: ["generate", "*"],
    requiredInputs: ["gameplay"],
    producedOutputs: ["ui"],
    dependencies: ["gameplay-agent"],
    priority: 2,
  };
  async execute(_input: AgentInput): Promise<AgentOutput> {
    return {
      agentId: this.agentId,
      success: true,
      outputs: { ui: { screens: 3 } },
      durationMs: 2,
    };
  }
}

class MockFailingAgent extends BaseAgentV2 {
  readonly agentId = "failing-agent";
  readonly capability: AgentCapability = {
    id: "cap-fail",
    agentId: "failing-agent",
    supportedTasks: ["generate"],
    requiredInputs: [],
    producedOutputs: [],
    dependencies: [],
    priority: 0,
  };
  async execute(_input: AgentInput): Promise<AgentOutput> {
    return {
      agentId: this.agentId,
      success: false,
      outputs: {},
      durationMs: 1,
      error: "Intentional failure",
    };
  }
}

class MockCircularA extends BaseAgentV2 {
  readonly agentId = "circular-a";
  readonly capability: AgentCapability = {
    id: "cap-ca",
    agentId: "circular-a",
    supportedTasks: ["generate"],
    requiredInputs: [],
    producedOutputs: [],
    dependencies: ["circular-b"],
    priority: 0,
  };
  async execute(_input: AgentInput): Promise<AgentOutput> {
    return { agentId: this.agentId, success: true, outputs: {}, durationMs: 0 };
  }
}

class MockCircularB extends BaseAgentV2 {
  readonly agentId = "circular-b";
  readonly capability: AgentCapability = {
    id: "cap-cb",
    agentId: "circular-b",
    supportedTasks: ["generate"],
    requiredInputs: [],
    producedOutputs: [],
    dependencies: ["circular-a"],
    priority: 0,
  };
  async execute(_input: AgentInput): Promise<AgentOutput> {
    return { agentId: this.agentId, success: true, outputs: {}, durationMs: 0 };
  }
}

describe("AgentOrchestrator", () => {
  it("orchestrates single agent", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new MockGameplayAgent());
    const orch = new AgentOrchestrator(registry);
    const result = await orch.orchestrate("generate", "proj-1", "make a game");
    expect(result.success).toBe(true);
    expect(result.completedSteps).toBe(1);
    expect(result.outputs["gameplay-agent.gameplay"]).toBeDefined();
  });

  it("orchestrates multi-agent in dependency order", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new MockGameplayAgent());
    registry.register(new MockLuaAgent());
    registry.register(new MockUIAgent());
    const orch = new AgentOrchestrator(registry);
    const result = await orch.orchestrate("generate", "proj-1", "obby game");
    expect(result.success).toBe(true);
    expect(result.completedSteps).toBe(3);
    expect(result.outputs["lua-agent.scripts"]).toBeDefined();
    expect(result.outputs["ui-agent.ui"]).toBeDefined();
  });

  it("handles agent failure", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new MockFailingAgent());
    const orch = new AgentOrchestrator(registry);
    const result = await orch.orchestrate("generate", "proj-1", "fail");
    expect(result.success).toBe(false);
    expect(result.failedSteps).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("detects circular dependencies", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new MockCircularA());
    registry.register(new MockCircularB());
    const orch = new AgentOrchestrator(registry);
    const result = await orch.orchestrate("generate", "proj-1", "cycle");
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Circular"))).toBe(true);
  });
});

describe("CapabilityRegistry", () => {
  it("registers and finds agents by task", () => {
    const registry = new CapabilityRegistry();
    registry.register(new MockGameplayAgent());
    registry.register(new MockLuaAgent());
    expect(registry.size).toBe(2);
    expect(registry.findForTask("generate").length).toBe(2);
  });
});

describe("AgentDependencyPlanner", () => {
  it("creates valid plan", () => {
    const planner = new AgentDependencyPlanner();
    const caps = [
      new MockGameplayAgent().capability,
      new MockLuaAgent().capability,
    ];
    const result = planner.createPlan(caps, "generate");
    expect(result.valid).toBe(true);
    expect(result.plan!.steps[0].agentId).toBe("gameplay-agent");
    expect(result.plan!.steps[1].agentId).toBe("lua-agent");
  });

  it("detects cycles", () => {
    const planner = new AgentDependencyPlanner();
    const caps = [
      new MockCircularA().capability,
      new MockCircularB().capability,
    ];
    const result = planner.createPlan(caps, "generate");
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });
});

describe("AgentMessageBus", () => {
  it("sends and receives messages", () => {
    const bus = new AgentMessageBus();
    const received: unknown[] = [];
    bus.subscribe("agent-1", (msg) => received.push(msg.payload));
    bus.send("orchestrator", "agent-1", "request", { task: "go" });
    expect(received.length).toBe(1);
    expect(bus.totalMessages).toBe(1);
  });
});

describe("SharedAgentContext", () => {
  it("stores and retrieves knowledge", () => {
    const ctx = new SharedAgentContext();
    ctx.setKnowledge("gameplay", { m: 1 }, "agent-1");
    expect(ctx.getKnowledge("gameplay")).toEqual({ m: 1 });
    expect(ctx.knowledgeCount).toBe(1);
  });

  it("stores artifacts", () => {
    const ctx = new SharedAgentContext();
    ctx.storeArtifact("a1", { scripts: [] });
    expect(ctx.hasArtifact("a1")).toBe(true);
    expect(ctx.artifactCount).toBe(1);
  });
});

describe("AgentExecutionValidator", () => {
  it("validates a valid plan", () => {
    const planner = new AgentDependencyPlanner();
    const plan = planner.createPlan(
      [new MockGameplayAgent().capability],
      "generate",
    ).plan!;
    const validator = new AgentExecutionValidator();
    const report = validator.validatePlan(plan);
    expect(report.valid).toBe(true);
  });
});
