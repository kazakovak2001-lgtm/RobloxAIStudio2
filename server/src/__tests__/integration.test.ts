/**
 * Integration Tests — End-to-end verification of core DevKit modules.
 */

import { describe, it, expect } from "vitest";
import { LuaGenerationEngine } from "../generation/lua";
import { ExperienceAssembler } from "../generation/experience";
import { AssetGenerationEngine } from "../generation/assets";
import { PlaytestEngine } from "../playtest";
import { RepairEngine } from "../repair";
import { KnowledgeEngine } from "../knowledge";
import { DomainEngine } from "../domain";
import { AutonomousOrchestrator } from "../orchestrator";
import { GameArchitect } from "../ai/gameArchitect";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { ArtifactStore } from "../pipeline/v2";

/** ARTIFACT-CONTRACT-2 requires an owning project on every new artifact. */
const ARTIFACT_TEST_PROJECT = "artifact-contract-test-project";

describe("Integration: Full Pipeline", () => {
  it("generates a complete Lua script package", () => {
    const engine = new LuaGenerationEngine();
    const result = engine.generateFullPackage(
      "test-project",
      "Test Game",
      "rpg",
    );

    expect(result.totalScripts).toBeGreaterThanOrEqual(8);
    expect(result.validationPassed).toBe(true);
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.artifacts[0].content).toBeTruthy();
    expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("assembles experience from generated scripts", () => {
    const luaEngine = new LuaGenerationEngine();
    const assembler = new ExperienceAssembler();

    const scripts = luaEngine.generateFullPackage(
      "test-proj",
      "RPG Game",
      "rpg",
    );
    const assembly = assembler.assemble(scripts);

    expect(assembly.success).toBe(true);
    expect(assembly.manifest.hierarchy.length).toBeGreaterThan(0);
    expect(assembly.manifest.dependencyGraph.nodes.length).toBe(
      scripts.totalScripts,
    );
    expect(assembly.validation.score).toBeGreaterThan(50);
  });

  it("generates asset package", () => {
    const engine = new AssetGenerationEngine();
    const result = engine.generate({
      projectId: "test",
      gameName: "Test",
      genre: "rpg",
      systems: ["gameplay", "combat", "inventory"],
    });

    expect(result.manifest.totalAssets).toBeGreaterThan(10);
    expect(result.validation.valid).toBe(true);
    expect(result.manifest.placeholderCount).toBeGreaterThan(0);
  });

  it("runs playtest on generated scripts", () => {
    const luaEngine = new LuaGenerationEngine();
    const playtestEngine = new PlaytestEngine();

    const scripts = luaEngine.generateFullPackage("test", "Game", "adventure");

    const report = playtestEngine.run({
      projectId: "test",
      scripts: scripts.artifacts.map((a) => ({
        name: a.name,
        type: a.scriptType,
        path: a.path,
        content: a.content,
        dependencies: a.dependencies,
      })),
      assets: [],
    });

    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.scores.lua).toBeGreaterThan(50);
    expect(report.performance.scriptCount).toBe(scripts.totalScripts);
  });

  it("runs a real repair attempt against a stored execution", async () => {
    const luaEngine = new LuaGenerationEngine();
    const scripts = luaEngine.generateFullPackage("test", "Game", "rpg");

    const artifactStore = new ArtifactStore();
    const executionId = "integration-test-exec";
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
      { projectId: ARTIFACT_TEST_PROJECT },
    );

    const blueprintRepository = new InMemoryBlueprintRepository();
    await blueprintRepository.createBlueprint("integration-test-user", {
      project_id: "test",
      user_id: "integration-test-user",
      name: "Integration Test Game",
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

    const session = await repairEngine.run("test", executionId, {
      maxIterations: 1,
      targetScore: 95,
    });

    expect(session.status).not.toBe("running");
    expect(session.currentScore).toBeGreaterThan(0);
    expect(session.totalRepairs).toBeGreaterThanOrEqual(0);
  });

  it("Game Architect produces complete result", () => {
    const architect = new GameArchitect();
    const result = architect.process({
      description: "A fantasy survival RPG with crafting and multiplayer",
      genre: "rpg",
      theme: "medieval fantasy",
    });

    expect(result.analysis.genre).toBe("rpg");
    expect(result.analysis.requiredSystems.length).toBeGreaterThan(3);
    expect(result.agentPrompts.totalAgents).toBe(7);
    expect(result.qualityScore.overall).toBeGreaterThan(50);
  });

  it("Domain engine benchmarks a project", () => {
    const domain = new DomainEngine();
    const result = domain.analyze({
      genre: "rpg",
      systems: ["combat", "inventory", "quests", "progression"],
      scriptCount: 12,
      assetCount: 15,
      hasMultiplayer: true,
    });

    expect(result.overallScore).toBeGreaterThan(40);
    expect(result.completeness).toBeGreaterThan(0);
  });

  it("Knowledge engine stores and retrieves patterns", () => {
    const knowledge = new KnowledgeEngine();
    const patterns = knowledge.patterns.getAll();
    expect(patterns.length).toBeGreaterThanOrEqual(8);

    const recs = knowledge.getRecommendations("rpg", ["combat", "inventory"]);
    expect(recs.recommendedPatterns.length).toBeGreaterThan(0);
  });

  it("Autonomous orchestrator starts and tracks session", async () => {
    const orch = new AutonomousOrchestrator();
    const session = await orch.run("Create a simple obby game", "test-auto");

    expect(session.id).toBeTruthy();
    expect(session.status).toBe("running");

    // Wait for async completion
    await new Promise((r) => setTimeout(r, 2500));
    const final = orch.getSession(session.id);
    expect(final).not.toBeNull();
    expect(final!.status).toBe("preview_completed");
    expect(final!.genre).toBe("obby");
    expect(final!.checkpoints.length).toBeGreaterThan(0);
  });
});
