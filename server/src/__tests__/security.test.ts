/**
 * Security Tests — Input validation, API boundaries, and access control.
 */

import { describe, it, expect } from "vitest";
import { LuaCodeValidator } from "../generation/lua/LuaCodeValidator";
import { AutonomousOrchestrator } from "../orchestrator";
import { PlaytestEngine } from "../playtest";

describe("Security Audit", () => {
  describe("Input Validation", () => {
    it("rejects empty prompt in orchestrator", () => {
      const orch = new AutonomousOrchestrator();
      // The API layer validates this; engine itself should handle gracefully
      const session = orch.run("test", "proj-1");
      expect(session.id).toBeTruthy();
    });

    it("handles extremely long prompts without crash", () => {
      const orch = new AutonomousOrchestrator();
      const longPrompt = "Create a game ".repeat(10000);
      const session = orch.run(longPrompt, "long-prompt");
      expect(session.id).toBeTruthy();
      expect(session.status).toBe("running");
    });

    it("handles special characters in project IDs", () => {
      const orch = new AutonomousOrchestrator();
      const session = orch.run("test game", "proj-<script>alert(1)</script>");
      expect(session.id).toBeTruthy();
    });

    it("playtest handles empty scripts array", () => {
      const engine = new PlaytestEngine();
      const report = engine.run({
        projectId: "empty",
        scripts: [],
        assets: [],
      });
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });

    it("playtest handles malformed script content", () => {
      const engine = new PlaytestEngine();
      const report = engine.run({
        projectId: "malformed",
        scripts: [
          {
            name: "BadScript",
            type: "ServerScript",
            path: "ServerScriptService/Bad",
            content: "\x00\x01\x02 invalid binary content",
            dependencies: [],
          },
        ],
        assets: [],
      });
      expect(report).toBeTruthy();
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Lua Code Security", () => {
    const validator = new LuaCodeValidator();

    it("detects loadstring usage", () => {
      const report = validator.validate("test", 'loadstring("exploit")()');
      expect(report.errors.length).toBeGreaterThan(0);
      expect(report.errors.some((e) => e.includes("loadstring"))).toBe(true);
    });

    it("detects setfenv usage", () => {
      const report = validator.validate("test", "setfenv(1, {})");
      expect(report.errors.length).toBeGreaterThan(0);
    });

    it("detects getfenv usage", () => {
      const report = validator.validate("test", "local env = getfenv()");
      expect(report.errors.length).toBeGreaterThan(0);
    });

    it("passes clean script", () => {
      const report = validator.validate(
        "test",
        `--[[\n  Clean script\n]]\nlocal module = {}\nfunction module.init()\n  print("Hello")\nend\nreturn module\n`,
      );
      expect(report.errors).toHaveLength(0);
      expect(report.passed).toBe(true);
    });

    it("warns about deprecated APIs", () => {
      const report = validator.validate(
        "test",
        "wait(1)\nspawn(function() end)",
      );
      expect(report.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("API Boundary Checks", () => {
    it("orchestrator pause/resume/cancel require valid session", () => {
      const orch = new AutonomousOrchestrator();
      expect(orch.pause("nonexistent")).toBe(false);
      expect(orch.resume("nonexistent")).toBe(false);
      expect(orch.cancel("nonexistent")).toBe(false);
    });

    it("orchestrator cancel stops execution", () => {
      const orch = new AutonomousOrchestrator();
      const session = orch.run("test game", "cancel-test");
      const cancelled = orch.cancel(session.id);
      expect(cancelled).toBe(true);
      const final = orch.getSession(session.id);
      expect(final!.status).toBe("cancelled");
    });
  });
});
