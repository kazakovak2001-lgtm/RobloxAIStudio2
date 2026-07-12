/**
 * Performance Tests — Benchmarks for generation speed, memory, and concurrency.
 */

import { describe, it, expect } from "vitest";
import { LuaGenerationEngine } from "../generation/lua";
import { ExperienceAssembler } from "../generation/experience";
import { AssetGenerationEngine } from "../generation/assets";
import { PlaytestEngine } from "../playtest";
import { RepairEngine } from "../repair";
import { AutonomousOrchestrator } from "../orchestrator";

describe("Performance Benchmarks", () => {
  describe("Lua Generation Speed", () => {
    it("generates full package under 50ms", () => {
      const engine = new LuaGenerationEngine();
      const start = performance.now();
      const result = engine.generateFullPackage(
        "perf-test",
        "Perf Game",
        "rpg",
      );
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
      expect(result.totalScripts).toBeGreaterThanOrEqual(8);
    });

    it("handles 10 sequential generations under 200ms", () => {
      const engine = new LuaGenerationEngine();
      const start = performance.now();

      for (let i = 0; i < 10; i++) {
        engine.generateFullPackage(`perf-${i}`, `Game ${i}`, "adventure");
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(200);
    });
  });

  describe("Experience Assembly Speed", () => {
    it("assembles experience under 20ms", () => {
      const luaEngine = new LuaGenerationEngine();
      const assembler = new ExperienceAssembler();
      const scripts = luaEngine.generateFullPackage("perf", "Game", "rpg");

      const start = performance.now();
      const result = assembler.assemble(scripts);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(20);
      expect(result.success).toBe(true);
    });
  });

  describe("Asset Generation Speed", () => {
    it("generates asset package under 10ms", () => {
      const engine = new AssetGenerationEngine();
      const start = performance.now();
      const result = engine.generate({
        projectId: "perf",
        gameName: "Game",
        genre: "rpg",
        systems: ["gameplay", "combat", "inventory"],
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
      expect(result.manifest.totalAssets).toBeGreaterThan(0);
    });
  });

  describe("Playtest Speed", () => {
    it("runs playtest under 10ms", () => {
      const luaEngine = new LuaGenerationEngine();
      const playtestEngine = new PlaytestEngine();
      const scripts = luaEngine.generateFullPackage("perf", "Game", "rpg");

      const start = performance.now();
      playtestEngine.run({
        projectId: "perf",
        scripts: scripts.artifacts.map((a) => ({
          name: a.name,
          type: a.scriptType,
          path: a.path,
          content: a.content,
          dependencies: a.dependencies,
        })),
        assets: [],
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });
  });

  describe("Repair Loop Speed", () => {
    it("completes 3 repair iterations under 50ms", () => {
      const luaEngine = new LuaGenerationEngine();
      const repairEngine = new RepairEngine();
      const scripts = luaEngine.generateFullPackage("perf", "Game", "rpg");

      const start = performance.now();
      repairEngine.run(
        {
          projectId: "perf",
          scripts: scripts.artifacts.map((a) => ({
            name: a.name,
            type: a.scriptType,
            path: a.path,
            content: a.content,
            dependencies: a.dependencies,
          })),
          assets: [],
        },
        { maxIterations: 3, targetScore: 99, timeoutMs: 5000 },
      );
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });

  describe("Concurrent Generations", () => {
    it("handles 5 simultaneous orchestrator runs", async () => {
      const orch = new AutonomousOrchestrator();
      const prompts = [
        "Create an obby game",
        "Create a simulator game",
        "Create an RPG game",
        "Create a tycoon game",
        "Create an adventure game",
      ];

      const sessions = prompts.map((p, i) => orch.run(p, `concurrent-${i}`));

      expect(sessions).toHaveLength(5);
      for (const s of sessions) {
        expect(s.status).toBe("running");
      }

      // Wait for all to complete
      await new Promise((r) => setTimeout(r, 3000));

      for (const s of sessions) {
        const final = orch.getSession(s.id);
        expect(final).not.toBeNull();
        expect(final!.status).toBe("completed");
      }
    });
  });

  describe("Memory Stability", () => {
    it("does not leak memory over 100 generations", () => {
      const engine = new LuaGenerationEngine();
      const baseMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        engine.generateFullPackage(`mem-${i}`, `Game ${i}`, "simulator");
      }

      const afterMemory = process.memoryUsage().heapUsed;
      const growthMB = (afterMemory - baseMemory) / 1024 / 1024;

      // Should not grow more than 50MB for 100 generations
      expect(growthMB).toBeLessThan(50);
    });
  });
});
