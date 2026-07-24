/**
 * generation-v2.routes.ts
 *
 * API layer for the Roblox Generation Core v1.0.
 * End-to-end: goal → blueprint → lua → assets → validation → export
 */

import { Router } from "express";
import { GameBlueprintEngine } from "../generation/blueprint/GameBlueprintEngine";
import { LuaGenerator } from "../generation/lua/LuaGenerator";
import { AssetGenerator } from "../generation/assets/AssetGenerator";
import { GameValidationEngine } from "../generation/validation/GameValidationEngine";
import { RobloxExportBuilder } from "../generation/export/RobloxExportBuilder";
import { PlannerEngine } from "../planning/core/PlannerEngine";
import { PlanExecutor } from "../planning/execution/PlanExecutor";
import { AgentRegistry } from "../agents/core/AgentRegistry";

export function createGenerationV2Router(agentRegistry: AgentRegistry): Router {
  const router = Router();
  const blueprintEngine = new GameBlueprintEngine();
  const luaGen = new LuaGenerator();
  const assetGen = new AssetGenerator();
  const validator = new GameValidationEngine();
  const exporter = new RobloxExportBuilder();
  const planner = new PlannerEngine();
  const executor = new PlanExecutor();

  // POST /generate/game — full end-to-end generation
  router.post("/game", async (req, res) => {
    try {
      const { intent, constraints, projectId } = req.body;

      // 1. Plan
      const plan = planner.createPlan({
        intent: intent ?? "Generate a Roblox game",
        constraints: constraints ?? [],
        projectId,
      });
      const execResult = await executor.executePlan(
        plan.planId,
        plan.graph,
        (agent, input) => agentRegistry.executeAgent(agent, input),
        { projectId, stopOnFailure: false },
      );

      // 2. Blueprint
      const blueprint = blueprintEngine.generate(execResult.outputs);

      // 3. Lua
      const lua = luaGen.generate(blueprint);

      // 4. Assets
      const assets = assetGen.generate(blueprint);

      // 5. Validate
      const validation = validator.validate(blueprint, lua, assets);

      // 6. Export
      const exportResult = exporter.build(blueprint, lua, assets);

      res.json({
        success: true,
        data: {
          blueprint: {
            id: blueprint.id,
            title: blueprint.title,
            genre: blueprint.genre,
            mechanics: blueprint.mechanics,
          },
          lua: { scripts: lua.totalScripts, lines: lua.totalLines },
          assets: { objects: assets.totalObjects },
          validation: {
            passed: validation.passed,
            score: validation.score,
            errors: validation.errors,
            warnings: validation.warnings,
          },
          export: {
            files: exportResult.totalFiles,
            projectName: exportResult.projectName,
          },
          plan: {
            tasks: execResult.graph.getStats(),
            duration: execResult.totalDurationMs,
          },
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Game generation failed" });
    }
  });

  // POST /generate/blueprint — generate only the blueprint
  router.post("/blueprint", (req, res) => {
    try {
      const outputs = req.body.outputs ?? req.body;
      const blueprint = blueprintEngine.generate(outputs);
      res.json({ success: true, data: blueprint });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Blueprint generation failed" });
    }
  });

  // POST /generate/lua — generate Lua from a blueprint
  router.post("/lua", (req, res) => {
    try {
      const blueprint = req.body.blueprint;
      if (!blueprint) {
        res.status(400).json({ success: false, error: "Blueprint required" });
        return;
      }
      const lua = luaGen.generate(blueprint);
      res.json({ success: true, data: lua });
    } catch (error) {
      res.status(500).json({ success: false, error: "Lua generation failed" });
    }
  });

  // POST /generate/export — generate export package
  router.post("/export", (req, res) => {
    try {
      const { blueprint, lua, assets } = req.body;
      if (!blueprint || !lua || !assets) {
        res.status(400).json({
          success: false,
          error: "blueprint, lua, and assets required",
        });
        return;
      }
      const result = exporter.build(blueprint, lua, assets);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: "Export failed" });
    }
  });

  return router;
}
