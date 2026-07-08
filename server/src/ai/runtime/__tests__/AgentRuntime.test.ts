import { describe, it, expect } from "vitest";
import { AgentRuntime } from "../AgentRuntime";
import { AgentValidator } from "../AgentValidator";
import { ExecutionPolicy } from "../ExecutionPolicy";

describe("AgentRuntime", () => {
  it("validates and records successful execution", () => {
    const runtime = new AgentRuntime();
    const result = runtime.validateAndRecord({
      agentId: "requirements",
      input: { name: "Test", genre: "rpg" },
      output: { requirements: { functional: [] } },
      executionTimeMs: 100,
      success: true,
    });
    expect(result.preValidation.valid).toBe(true);
    expect(result.postValidation.valid).toBe(true);
    expect(result.record.success).toBe(true);
    expect(runtime.historyCount).toBe(1);
  });

  it("detects missing context", () => {
    const runtime = new AgentRuntime();
    const result = runtime.validateBeforeExecution("requirements", {
      name: "X",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("genre"))).toBe(true);
  });

  it("detects missing output keys", () => {
    const runtime = new AgentRuntime();
    const result = runtime.validateAndRecord({
      agentId: "requirements",
      input: { name: "Test", genre: "rpg" },
      output: { wrongKey: "value" },
      executionTimeMs: 50,
      success: true,
    });
    expect(result.postValidation.valid).toBe(false);
    expect(
      result.postValidation.errors.some((e) => e.includes("requirements")),
    ).toBe(true);
  });

  it("tracks execution history", () => {
    const runtime = new AgentRuntime();
    runtime.validateAndRecord({
      agentId: "planner",
      input: { name: "A", requirements_summary: "B" },
      output: { plan: {} },
      executionTimeMs: 50,
      success: true,
    });
    runtime.validateAndRecord({
      agentId: "planner",
      input: { name: "C", requirements_summary: "D" },
      output: { plan: {} },
      executionTimeMs: 60,
      success: true,
    });
    expect(runtime.getHistory("planner").length).toBe(2);
    expect(runtime.getHistory("requirements").length).toBe(0);
  });
});

describe("ExecutionPolicy", () => {
  it("uses defaults", () => {
    const policy = new ExecutionPolicy();
    expect(policy.requireContextValidation).toBe(true);
    expect(policy.requireOutputValidation).toBe(true);
    expect(policy.allowRetry).toBe(true);
    expect(policy.globalTimeout).toBe(300000);
  });

  it("accepts overrides", () => {
    const policy = new ExecutionPolicy({ requireContextValidation: false });
    expect(policy.requireContextValidation).toBe(false);
  });
});

describe("AgentValidator", () => {
  it("skips context validation when policy disables it", () => {
    const policy = new ExecutionPolicy({ requireContextValidation: false });
    const validator = new AgentValidator(policy);
    const result = validator.validatePreExecution("requirements", {});
    expect(result.valid).toBe(true); // context validation skipped
  });
});
