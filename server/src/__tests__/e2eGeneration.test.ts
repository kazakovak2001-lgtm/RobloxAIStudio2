/**
 * E2E Generation Tests — Validates complete pipeline from prompt to Studio-ready package.
 * Proves the system produces a valid, deployable Roblox project.
 */

import { describe, it, expect } from "vitest";
import { GameArchitect } from "../ai/gameArchitect";
import { LuaGenerationEngine } from "../generation/lua";
import { AssetGenerationEngine } from "../generation/assets";
import { ExperienceAssembler } from "../generation/experience";
import { PlaytestEngine } from "../playtest";
import { RepairEngine } from "../repair";
import { DomainEngine } from "../domain";
import { KnowledgeEngine } from "../knowledge";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { ArtifactStore } from "../pipeline/v2";

/** ARTIFACT-CONTRACT-2 requires an owning project on every new artifact. */
const ARTIFACT_TEST_PROJECT = "artifact-contract-test-project";

describe("E2E: Real Game Generation", () => {
  it("generates a complete survival game from a single prompt", async () => {
    const prompt =
      "Create a survival game with crafting, building, and multiplayer";

    // Step 1: Game Architect analyzes the idea
    const architect = new GameArchitect();
    const archResult = architect.process({
      description: prompt,
      genre: "survival",
      theme: "wilderness",
      multiplayerType: "cooperative",
    });

    expect(archResult.analysis.genre).toBe("survival");
    expect(archResult.analysis.requiredSystems.length).toBeGreaterThan(3);
    expect(archResult.agentPrompts.totalAgents).toBe(7);
    expect(archResult.qualityScore.overall).toBeGreaterThan(50);

    // Step 2: Domain benchmark
    const domain = new DomainEngine();
    const benchmark = domain.analyze({
      genre: "survival",
      systems: archResult.analysis.requiredSystems,
      scriptCount: 16,
      assetCount: 20,
      hasMultiplayer: true,
    });
    expect(benchmark.overallScore).toBeGreaterThan(30);

    // Step 3: Generate Lua scripts
    const luaEngine = new LuaGenerationEngine();
    const scripts = luaEngine.generateFullPackage(
      "survival-project",
      "Wilderness Survival",
      "survival",
    );

    expect(scripts.totalScripts).toBeGreaterThanOrEqual(8);
    expect(scripts.validationPassed).toBe(true);
    expect(scripts.artifacts.every((a) => a.content.length > 0)).toBe(true);

    // Step 4: Generate assets
    const assetEngine = new AssetGenerationEngine();
    const assets = assetEngine.generate({
      projectId: "survival-project",
      gameName: "Wilderness Survival",
      genre: "survival",
      systems: ["gameplay", "combat", "inventory"],
    });

    expect(assets.manifest.totalAssets).toBeGreaterThan(10);
    expect(assets.validation.valid).toBe(true);

    // Step 5: Assemble experience
    const assembler = new ExperienceAssembler();
    const assembly = assembler.assemble(scripts);

    expect(assembly.success).toBe(true);
    expect(assembly.manifest.hierarchy.length).toBeGreaterThan(0);
    expect(assembly.manifest.dependencyGraph.circular).toHaveLength(0);
    expect(assembly.validation.score).toBeGreaterThan(50);

    // Verify Roblox hierarchy
    const services = assembly.manifest.hierarchy.map((h) => h.name);
    expect(services).toContain("ServerScriptService");
    expect(services).toContain("ReplicatedStorage");

    // Step 6: Playtest
    const playtestEngine = new PlaytestEngine();
    const playtestReport = playtestEngine.run({
      projectId: "survival-project",
      scripts: scripts.artifacts.map((a) => ({
        name: a.name,
        type: a.scriptType,
        path: a.path,
        content: a.content,
        dependencies: a.dependencies,
      })),
      assets: assets.manifest.assets.map((a) => ({
        name: a.name,
        type: a.type,
        targetService: a.targetService,
        placeholder: a.placeholder,
      })),
      dependencyGraph: assembly.manifest.dependencyGraph,
    });

    expect(playtestReport.overallScore).toBeGreaterThan(0);
    expect(playtestReport.performance.scriptCount).toBe(scripts.totalScripts);

    // Step 7: Repair loop — persist the generated artifacts for real, then
    // run a real repair attempt against them (REPAIR-1A).
    const artifactStore = new ArtifactStore();
    const repairExecutionId = "e2e-survival-exec";
    await artifactStore.store(
      repairExecutionId,
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
    // ASSET-FABRIC-1. The asset plan derives from the game design, and the
    // artifact contract now requires it to say so, matching what
    // `pipelineDefinition` already declares for `asset_planner`.
    const e2eDesign = await artifactStore.store(
      repairExecutionId,
      "GAME_DESIGN",
      "game_designer",
      { gameplay: { mechanics: [{ name: "survive" }] } },
      { projectId: ARTIFACT_TEST_PROJECT },
    );
    await artifactStore.store(
      repairExecutionId,
      "ASSET_PLANNING",
      "asset_planner",
      {
        assetPlan: {
          models: assets.manifest.assets
            .filter((a) => a.type === "MeshMetadata")
            .map((a) => ({ name: a.name })),
        },
      },
      {
        projectId: ARTIFACT_TEST_PROJECT,
        dependencies: [ArtifactStore.dependencyOn(e2eDesign)],
      },
    );

    const blueprintRepository = new InMemoryBlueprintRepository();
    await blueprintRepository.createBlueprint("e2e-test-user", {
      project_id: "survival-project",
      user_id: "e2e-test-user",
      name: "Wilderness Survival",
      description: prompt,
      game_type: "survival",
      genre: ["survival"],
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
    const repairSession = await repairEngine.run(
      "survival-project",
      repairExecutionId,
      { maxIterations: 1, targetScore: 90 },
    );

    expect(repairSession.currentScore).toBeGreaterThan(0);

    // Step 8: Knowledge learning
    const knowledge = new KnowledgeEngine();
    knowledge.learn({
      id: "gen-survival-1",
      projectId: "survival-project",
      genre: "survival",
      systems: archResult.analysis.requiredSystems,
      mechanics: ["crafting", "building", "combat"],
      scriptCount: scripts.totalScripts,
      assetCount: assets.manifest.totalAssets,
      playtestScore: playtestReport.overallScore,
      finalScore: repairSession.currentScore,
      repairIterations: repairSession.currentIteration,
      totalTokens: 5000,
      totalCost: 0.01,
      duration: 1000,
      patterns: ["inventory", "combat", "save"],
      createdAt: Date.now(),
    });

    // Verify knowledge was stored
    const recs = knowledge.getRecommendations("survival", [
      "combat",
      "inventory",
    ]);
    expect(recs.recommendedPatterns.length).toBeGreaterThan(0);
  });

  it("produces valid script content for all core modules", () => {
    const engine = new LuaGenerationEngine();
    const result = engine.generateFullPackage(
      "validate-content",
      "Content Test",
      "rpg",
    );

    for (const artifact of result.artifacts) {
      // Every script must have content
      expect(artifact.content.length).toBeGreaterThan(50);
      // Every script must have proper Lua structure
      expect(artifact.content).toContain("return");
      // No forbidden APIs
      expect(artifact.content).not.toContain("loadstring");
      expect(artifact.content).not.toContain("setfenv");
      // Has module structure
      expect(artifact.content).toMatch(/local \w+ = {}/);
    }
  });

  it("generates correct Roblox service placement", () => {
    const engine = new LuaGenerationEngine();
    const assembler = new ExperienceAssembler();
    const result = engine.generateFullPackage(
      "placement-test",
      "Game",
      "tycoon",
    );
    const assembly = assembler.assemble(result);

    const serverService = assembly.manifest.hierarchy.find(
      (h) => h.name === "ServerScriptService",
    );
    const replicatedService = assembly.manifest.hierarchy.find(
      (h) => h.name === "ReplicatedStorage",
    );
    const starterPlayer = assembly.manifest.hierarchy.find(
      (h) => h.name === "StarterPlayer",
    );

    // Server scripts in ServerScriptService
    expect(serverService?.children?.length).toBeGreaterThan(0);
    expect(
      serverService?.children?.every(
        (c) => c.type === "Script" || c.type === "ModuleScript",
      ),
    ).toBe(true);

    // Shared modules in ReplicatedStorage
    expect(replicatedService?.children?.length).toBeGreaterThan(0);
    expect(
      replicatedService?.children?.every((c) => c.type === "ModuleScript"),
    ).toBe(true);

    // Client scripts in StarterPlayer
    if (starterPlayer?.children?.length) {
      expect(
        starterPlayer.children.every(
          (c) => c.type === "LocalScript" || c.type === "ModuleScript",
        ),
      ).toBe(true);
    }
  });

  it("dependency graph has no circular references", () => {
    const engine = new LuaGenerationEngine();
    const assembler = new ExperienceAssembler();

    const genres = ["rpg", "simulator", "tycoon", "adventure", "obby"] as const;
    for (const genre of genres) {
      const result = engine.generateFullPackage(
        `dep-test-${genre}`,
        `${genre} Game`,
        genre,
      );
      const assembly = assembler.assemble(result);

      expect(assembly.manifest.dependencyGraph.circular).toHaveLength(0);
      expect(assembly.manifest.dependencyGraph.initOrder.length).toBe(
        result.totalScripts,
      );
    }
  });
});
