/**
 * compile.routes.ts
 *
 * MVP endpoint: single deterministic pass from goal → Roblox project.
 * No feedback loops, no recursive passes — one shot, one artifact, one project.
 */

import { Router } from "express";
import { PlannerEngine } from "../planning/core/PlannerEngine";
import { PlanExecutor } from "../planning/execution/PlanExecutor";
import { GameBlueprintEngine } from "../generation/blueprint/GameBlueprintEngine";
import { LuaGenerator } from "../generation/lua/LuaGenerator";
import { AssetGenerator } from "../generation/assets/AssetGenerator";
import { GameValidationEngine } from "../generation/validation/GameValidationEngine";
import { GameSimulationEngine } from "../simulation/core/GameSimulationEngine";
import { PlaytestAgent } from "../simulation/agents/PlaytestAgent";
import { EconomyModelEngine } from "../economy/core/EconomyModelEngine";
import { ImbalanceDetector } from "../economy/detection/ImbalanceDetector";
import { EconomySimulationEngine } from "../economy/simulation/EconomySimulationEngine";
import { GameArtifactBuilder } from "../artifacts/GameArtifactBuilder";
import { RobloxProjectCompiler } from "../export/RobloxProjectCompiler";
import { AgentRegistry } from "../agents/core/AgentRegistry";

export function createCompileRouter(agentRegistry: AgentRegistry): Router {
  const router = Router();

  // POST /compile — full deterministic compile: goal → Roblox project
  router.post("/", async (req, res) => {
    try {
      const startTime = Date.now();
      const { intent, constraints, projectId } = req.body;

      // Stage 1: Plan
      const planner = new PlannerEngine();
      const executor = new PlanExecutor();
      const plan = planner.createPlan({
        intent: intent ?? "Generate a Roblox game",
        constraints: constraints ?? [],
        projectId,
      });
      const planResult = await executor.executePlan(
        plan.planId,
        plan.graph,
        (agent, input) => agentRegistry.executeAgent(agent, input),
        { projectId, stopOnFailure: false },
      );

      // Stage 2: Blueprint
      const blueprintEngine = new GameBlueprintEngine();
      const blueprint = blueprintEngine.generate(planResult.outputs);

      // Stage 3: Lua Generation
      const luaGen = new LuaGenerator();
      const scripts = luaGen.generate(blueprint);

      // Stage 4: Asset Layout
      const assetGen = new AssetGenerator();
      const assets = assetGen.generate(blueprint);

      // Stage 5: Validation
      const validator = new GameValidationEngine();
      const validation = validator.validate(blueprint, scripts, assets);

      // Stage 6: Simulation
      const simEngine = new GameSimulationEngine();
      const simulation = simEngine.simulateGame(blueprint, 50);
      const playtester = new PlaytestAgent();
      const playtest = playtester.analyze(blueprint, simulation);

      // Stage 7: Economy
      const econEngine = new EconomyModelEngine();
      const economyModel = econEngine.parse(blueprint);
      const econSim = new EconomySimulationEngine();
      const econResult = econSim.simulate(economyModel, 100);
      const detector = new ImbalanceDetector();
      const imbalanceReport = detector.detect(economyModel, econResult);

      // FINAL STAGE: Build Artifact
      const artifactBuilder = new GameArtifactBuilder();
      const artifact = artifactBuilder.build({
        blueprint,
        scripts,
        assets,
        validation,
        economyModel,
        imbalanceReport,
        simulation,
        playtest,
        worldStability: 80,
        startTime,
      });

      // COMPILE: Artifact → Roblox Project
      const compiler = new RobloxProjectCompiler();
      const project = compiler.compile(artifact);

      res.json({
        success: true,
        data: {
          artifact: {
            id: artifact.id,
            blueprint: {
              title: artifact.blueprint.title,
              genre: artifact.blueprint.genre,
              mechanics: artifact.blueprint.mechanics,
            },
            scripts: {
              total: artifact.scripts.totalScripts,
              lines: artifact.scripts.totalLines,
            },
            assets: { objects: artifact.assets.totalObjects },
            validation: {
              score: artifact.validationReport.score,
              passed: artifact.validationReport.passed,
            },
            simulation: {
              engagement: artifact.simulationReport.playtest.engagementScore,
            },
            economy: {
              stability: artifact.economy.model.stabilityIndex,
              health: artifact.economy.imbalanceReport?.healthScore,
            },
          },
          project: {
            name: project.projectName,
            files: project.totalFiles,
            valid: project.valid,
            structure: project.structure,
          },
          pipeline: artifact.pipeline,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Compilation failed" });
    }
  });

  return router;
}
