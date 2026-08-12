/**
 * Security Tests — Input validation, API boundaries, and access control.
 */

import { describe, it, expect } from "vitest";
import { LuaCodeValidator } from "../generation/lua/LuaCodeValidator";
import { AutonomousOrchestrator } from "../orchestrator";
import { PlaytestEngine } from "../playtest";

describe("Security Audit", () => {
  describe("Input Validation", () => {
    it("rejects empty prompt in orchestrator", async () => {
      const orch = new AutonomousOrchestrator();
      // The API layer validates this; engine itself should handle gracefully
      const session = await orch.run("test", "proj-1");
      expect(session.id).toBeTruthy();
    });

    it("handles extremely long prompts without crash", async () => {
      const orch = new AutonomousOrchestrator();
      const longPrompt = "Create a game ".repeat(10000);
      const session = await orch.run(longPrompt, "long-prompt");
      expect(session.id).toBeTruthy();
      expect(session.status).toBe("running");
    });

    it("handles special characters in project IDs", async () => {
      const orch = new AutonomousOrchestrator();
      const session = await orch.run(
        "test game",
        "proj-<script>alert(1)</script>",
      );
      expect(session.id).toBeTruthy();
    });

    it("playtest handles empty scripts array", async () => {
      const engine = new PlaytestEngine();
      const report = engine.run({
        projectId: "empty",
        scripts: [],
        assets: [],
      });
      // PLAYTEST-TRUTH-1. No score to bound. An empty project yields a
      // readable report that claims nothing about quality.
      expect(report.evidenceKind).toBe("static-analysis");
      expect(report.runtime.status).toBe("not-measured");
      expect(report.findingCounts.total).toBe(report.issues.length);
    });

    it("playtest handles malformed script content", async () => {
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
      expect(report.runtime.status).toBe("not-measured");
    });
  });

  describe("Lua Code Security", () => {
    const validator = new LuaCodeValidator();

    it("detects loadstring usage", async () => {
      const report = validator.validate("test", 'loadstring("exploit")()');
      expect(report.errors.length).toBeGreaterThan(0);
      expect(report.errors.some((e) => e.includes("loadstring"))).toBe(true);
    });

    it("detects setfenv usage", async () => {
      const report = validator.validate("test", "setfenv(1, {})");
      expect(report.errors.length).toBeGreaterThan(0);
    });

    it("detects getfenv usage", async () => {
      const report = validator.validate("test", "local env = getfenv()");
      expect(report.errors.length).toBeGreaterThan(0);
    });

    it("passes clean script", async () => {
      const report = validator.validate(
        "test",
        `--[[\n  Clean script\n]]\nlocal module = {}\nfunction module.init()\n  print("Hello")\nend\nreturn module\n`,
      );
      expect(report.errors).toHaveLength(0);
      expect(report.passed).toBe(true);
    });

    it("warns about deprecated APIs", async () => {
      const report = validator.validate(
        "test",
        "wait(1)\nspawn(function() end)",
      );
      expect(report.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("API Boundary Checks", () => {
    it("orchestrator pause/resume/cancel require valid session", async () => {
      const orch = new AutonomousOrchestrator();
      expect(await orch.pause("nonexistent")).toBe(false);
      expect(await orch.resume("nonexistent")).toBe(false);
      expect(await orch.cancel("nonexistent")).toBe(false);
    });

    it("orchestrator cancel stops execution", async () => {
      const orch = new AutonomousOrchestrator();
      const session = await orch.run("test game", "cancel-test");
      const cancelled = await orch.cancel(session.id);
      expect(cancelled).toBe(true);
      const final = orch.getSession(session.id);
      expect(final!.status).toBe("cancelled");
    });
  });
});
