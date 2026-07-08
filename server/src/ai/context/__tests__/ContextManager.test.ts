import { describe, it, expect } from "vitest";
import { ContextManager } from "../ContextManager";
import { ContextValidator } from "../ContextValidator";
import { ContextSerializer } from "../ContextSerializer";

describe("ContextManager", () => {
  it("creates a session", () => {
    const mgr = new ContextManager();
    const session = mgr.createSession("proj-1", {
      name: "Test Game",
      genre: "obby",
    });
    expect(session.sessionId).toMatch(/^session-/);
    expect(session.projectId).toBe("proj-1");
    expect(session.gameBlueprint).toEqual({ name: "Test Game", genre: "obby" });
    expect(mgr.sessionCount).toBe(1);
  });

  it("records agent outputs", () => {
    const mgr = new ContextManager();
    const session = mgr.createSession("proj-1", { name: "X" });
    mgr.recordOutput(session.sessionId, "requirements", {
      requirements: { functional: ["a"] },
    });
    mgr.recordOutput(session.sessionId, "planner", { plan: { phases: [] } });
    const outputs = mgr.getPreviousOutputs(session.sessionId);
    expect(outputs.length).toBe(2);
    expect(outputs[0].agentId).toBe("requirements");
  });

  it("accumulates context across agents", () => {
    const mgr = new ContextManager();
    const session = mgr.createSession("proj-1", { name: "Game", genre: "rpg" });
    mgr.recordOutput(session.sessionId, "requirements", {
      requirements: "done",
    });
    mgr.recordOutput(session.sessionId, "game_designer", {
      gameplay: { mechanics: [] },
    });
    const ctx = mgr.getAccumulatedContext(session.sessionId);
    expect(ctx.name).toBe("Game");
    expect(ctx.requirements).toBe("done");
    expect(ctx.gameplay).toBeDefined();
  });

  it("builds execution context for agent", () => {
    const mgr = new ContextManager();
    const session = mgr.createSession("proj-1", { name: "X" });
    const execCtx = mgr.buildExecutionContext(
      session.sessionId,
      "lua_generator",
      { code: true },
      [{ hint: "use modules" }],
    );
    expect(execCtx).not.toBeNull();
    expect(execCtx!.agentId).toBe("lua_generator");
    expect(execCtx!.relevantMemory).toHaveLength(1);
    expect(mgr.getSession(session.sessionId)!.activeAgent).toBe(
      "lua_generator",
    );
  });

  it("records decisions", () => {
    const mgr = new ContextManager();
    const session = mgr.createSession("proj-1", {});
    mgr.recordDecision(
      session.sessionId,
      "game_designer",
      "mechanic",
      "Chose jump as core loop",
    );
    expect(session.decisions.length).toBe(1);
    expect(session.decisions[0].description).toContain("jump");
  });

  it("returns null for unknown session", () => {
    const mgr = new ContextManager();
    expect(mgr.getSession("nonexistent")).toBeNull();
    expect(mgr.buildExecutionContext("nonexistent", "x", {})).toBeNull();
  });
});

describe("ContextValidator", () => {
  const validator = new ContextValidator();

  it("validates correct context", () => {
    const mgr = new ContextManager();
    const session = mgr.createSession("p1", { name: "G" });
    expect(validator.validate(session).valid).toBe(true);
  });

  it("rejects null context", () => {
    expect(validator.validate(null).valid).toBe(false);
  });

  it("validates agent-specific requirements", () => {
    const mgr = new ContextManager();
    const session = mgr.createSession("p1", { name: "G", genre: "rpg" });
    const result = validator.validateForAgent(session, "requirements", [
      "name",
      "genre",
      "difficulty",
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("difficulty"))).toBe(true);
  });
});

describe("ContextSerializer", () => {
  it("serializes and deserializes", () => {
    const mgr = new ContextManager();
    const session = mgr.createSession("p1", { name: "X" });
    const serializer = new ContextSerializer();
    const json = serializer.serialize(session);
    const restored = serializer.deserialize(json);
    expect(restored).not.toBeNull();
    expect(restored!.sessionId).toBe(session.sessionId);
  });

  it("returns null for invalid JSON", () => {
    const serializer = new ContextSerializer();
    expect(serializer.deserialize("not json{{{")).toBeNull();
  });
});
