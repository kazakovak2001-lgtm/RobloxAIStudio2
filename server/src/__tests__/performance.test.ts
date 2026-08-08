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
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { ArtifactStore } from "../pipeline/v2";

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
    // REPAIR-1A replaced the free, synchronous simulateImprovement() with a
    // real artifact-store round trip, a real LuaGeneratorAgent call, and a
    // real playtest re-run — repair is deliberately no longer near-instant,
    // so this no longer asserts a tight millisecond bound. It still proves
    // a single bounded attempt (REPAIR-1A caps at one iteration) completes
    // in a reasonable time against the deterministic no-LLM fallback path.
    it("completes a single bounded repair attempt in a reasonable time", async () => {
      const luaEngine = new LuaGenerationEngine();
      const scripts = luaEngine.generateFullPackage("perf", "Game", "rpg");

      const artifactStore = new ArtifactStore();
      const executionId = "perf-test-exec";
      await artifactStore.store(
        executionId,
        "LUA_GENERATION",
        "lua_generator",
        {
          scripts: scripts.artifacts.map((a) => ({
            path: a.path,
            content: a.content,
          })),
        },
      );

      const blueprintRepository = new InMemoryBlueprintRepository();
      await blueprintRepository.createBlueprint("perf-test-user", {
        project_id: "perf",
        user_id: "perf-test-user",
        name: "Perf Game",
        description: "A blueprint used only to exercise the repair loop.",
        game_type: "rpg",
        genre: ["rpg"],
        target_audience: "all ages",
        difficulty: "medium",
        estimated_players: "small-group",
        gameplay: { mechanics: [], progression: {}, balance: {} },
        ui_layouts: [],
        architecture: {
          client_architecture: {},
          server_architecture: {},
          networking: {},
        },
        assets: { models: [], textures: [], sounds: [], animations: [] },
        code_spec: { modules: [], patterns: [] },
      });

      const agentRegistry = new AgentRegistry();
      const repairEngine = new RepairEngine(
        agentRegistry,
        blueprintRepository,
        artifactStore,
      );

      const start = performance.now();
      await repairEngine.run("perf", executionId, {
        maxIterations: 3,
        targetScore: 99,
        timeoutMs: 5000,
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5000);
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

      const sessions = await Promise.all(
        prompts.map((p, i) => orch.run(p, `concurrent-${i}`)),
      );

      expect(sessions).toHaveLength(5);
      for (const s of sessions) {
        expect(s.status).toBe("running");
      }

      // Wait for all to complete
      await new Promise((r) => setTimeout(r, 3000));

      for (const s of sessions) {
        const final = orch.getSession(s.id);
        expect(final).not.toBeNull();
        expect(final!.status).toBe("preview_completed");
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
