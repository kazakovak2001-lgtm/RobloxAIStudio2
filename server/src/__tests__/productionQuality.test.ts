/**
 * Production Quality Tests — Dashboard, versioning, scoring, multiplayer validation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { QualityDashboard } from "../analytics/QualityDashboard";
import { GenerationVersionManager } from "../analytics/GenerationVersionManager";
import { GameQualityScorer } from "../analytics/GameQualityScorer";
import { MultiplayerValidator } from "../analytics/MultiplayerValidator";

describe("Production Quality Layer", () => {
  describe("QualityDashboard", () => {
    let dashboard: QualityDashboard;

    beforeEach(() => {
      dashboard = new QualityDashboard();
    });

    it("records and aggregates metrics", () => {
      dashboard.record({
        projectId: "p1",
        success: true,
        qualityScore: 85,
        repairIterations: 2,
        durationMs: 1000,
        timestamp: Date.now(),
        engineVersion: "3.2",
        genre: "rpg",
      });
      dashboard.record({
        projectId: "p2",
        success: true,
        qualityScore: 90,
        repairIterations: 1,
        durationMs: 800,
        timestamp: Date.now(),
        engineVersion: "3.2",
        genre: "rpg",
      });
      dashboard.record({
        projectId: "p3",
        success: false,
        qualityScore: 30,
        repairIterations: 5,
        durationMs: 5000,
        timestamp: Date.now(),
        engineVersion: "3.2",
        genre: "obby",
      });

      const stats = dashboard.getStats();
      expect(stats.totalGenerations).toBe(3);
      expect(stats.successRate).toBe(67);
      expect(stats.failedCount).toBe(1);
      expect(stats.averageScore).toBeGreaterThan(50);
    });

    it("tracks errors", () => {
      dashboard.record({
        projectId: "fail",
        success: false,
        qualityScore: 0,
        repairIterations: 0,
        durationMs: 100,
        timestamp: Date.now(),
        engineVersion: "3.2",
        genre: "fps",
      });
      const stats = dashboard.getStats();
      expect(stats.recentErrors.length).toBe(1);
    });
  });

  describe("GenerationVersionManager", () => {
    let manager: GenerationVersionManager;

    beforeEach(() => {
      manager = new GenerationVersionManager();
    });

    it("saves and retrieves versions", () => {
      manager.save("proj-1", {
        projectId: "proj-1",
        engineVersion: "3.2",
        agentVersions: { lua: "2.0" },
        qualityScore: 80,
        scriptCount: 8,
        assetCount: 20,
        snapshot: {},
      });
      manager.save("proj-1", {
        projectId: "proj-1",
        engineVersion: "3.2",
        agentVersions: { lua: "2.0" },
        qualityScore: 90,
        scriptCount: 10,
        assetCount: 23,
        snapshot: {},
      });

      const history = manager.getHistory("proj-1");
      expect(history).toHaveLength(2);
    });

    it("compares versions", () => {
      const v1 = manager.save("proj-1", {
        projectId: "proj-1",
        engineVersion: "3.2",
        agentVersions: {},
        qualityScore: 70,
        scriptCount: 6,
        assetCount: 15,
        snapshot: {},
      });
      const v2 = manager.save("proj-1", {
        projectId: "proj-1",
        engineVersion: "3.2",
        agentVersions: {},
        qualityScore: 85,
        scriptCount: 8,
        assetCount: 20,
        snapshot: {},
      });

      const diff = manager.compare("proj-1", v1.id, v2.id);
      expect(diff!.scoreChange).toBe(15);
      expect(diff!.scriptChange).toBe(2);
    });
  });

  describe("GameQualityScorer", () => {
    const scorer = new GameQualityScorer();

    it("scores a complete project as good+", () => {
      const report = scorer.score({
        scriptCount: 10,
        hasConfig: true,
        hasDataStore: true,
        hasRemoteEvents: true,
        hasServerAuth: true,
        hasClientScripts: true,
        circularDeps: 0,
        validationScore: 90,
        playtestScore: 85,
        assetCount: 20,
        hasMultiplayer: true,
      });
      expect(report.overall).toBeGreaterThanOrEqual(75);
      expect(report.classification).toMatch(/excellent|good/);
    });

    it("scores a minimal project as needs_work", () => {
      const report = scorer.score({
        scriptCount: 2,
        hasConfig: false,
        hasDataStore: false,
        hasRemoteEvents: false,
        hasServerAuth: false,
        hasClientScripts: false,
        circularDeps: 2,
        validationScore: 40,
        playtestScore: 30,
        assetCount: 0,
        hasMultiplayer: false,
      });
      expect(report.overall).toBeLessThan(60);
      expect(report.issues.length).toBeGreaterThan(0);
    });
  });

  describe("MultiplayerValidator", () => {
    const validator = new MultiplayerValidator();

    it("detects client accessing DataStoreService", () => {
      const report = validator.validate([
        {
          name: "BadClient",
          type: "LocalScript",
          content: 'local ds = game:GetService("DataStoreService")',
        },
      ]);
      expect(report.valid).toBe(false);
      expect(report.issues.some((i) => i.severity === "critical")).toBe(true);
    });

    it("passes clean server/client separation", () => {
      const report = validator.validate([
        {
          name: "Server",
          type: "ServerScript",
          content: 'local ds = game:GetService("DataStoreService")',
        },
        {
          name: "Client",
          type: "LocalScript",
          content: 'local player = game:GetService("Players").LocalPlayer',
        },
      ]);
      expect(report.valid).toBe(true);
      expect(report.score).toBeGreaterThanOrEqual(80);
    });

    it("warns about client modifying WalkSpeed", () => {
      const report = validator.validate([
        {
          name: "ClientMove",
          type: "LocalScript",
          content:
            "local Humanoid = char:FindFirstChild('Humanoid'); Humanoid.WalkSpeed = 100",
        },
      ]);
      expect(report.issues.some((i) => i.category === "exploit")).toBe(true);
    });
  });
});
