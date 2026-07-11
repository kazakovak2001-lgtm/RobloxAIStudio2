/**
 * Lua Generation API — Generate Roblox Lua script packages and assemble experiences.
 */

import { Router } from "express";
import { LuaGenerationEngine } from "../generation/lua";
import { ExperienceAssembler } from "../generation/experience";
import { AssetGenerationEngine } from "../generation/assets";
import type { GameplaySystem } from "../generation/lua";

export function createLuaGenerationRouter(): Router {
  const router = Router();
  const engine = new LuaGenerationEngine();
  const assembler = new ExperienceAssembler();
  const assetEngine = new AssetGenerationEngine();

  // POST /api/lua/generate — generate scripts for specific systems
  router.post("/generate", (req, res) => {
    const { projectId, gameName, genre, systems, features } = req.body;

    if (!projectId || !gameName) {
      res
        .status(400)
        .json({ success: false, error: "projectId and gameName required" });
      return;
    }

    const result = engine.generate({
      projectId,
      gameName,
      genre: genre ?? "adventure",
      systems: (systems as GameplaySystem[]) ?? [],
      features: features ?? [],
    });

    res.json({ success: true, data: result });
  });

  // POST /api/lua/generate-full — generate all core systems
  router.post("/generate-full", (req, res) => {
    const { projectId, gameName, genre } = req.body;

    if (!projectId || !gameName) {
      res
        .status(400)
        .json({ success: false, error: "projectId and gameName required" });
      return;
    }

    const result = engine.generateFullPackage(
      projectId,
      gameName,
      genre ?? "adventure",
    );
    res.json({ success: true, data: result });
  });

  // POST /api/lua/assemble-experience — generate + assemble into complete experience
  router.post("/assemble-experience", (req, res) => {
    const { projectId, gameName, genre, conceptId, pipelineId } = req.body;

    if (!projectId || !gameName) {
      res
        .status(400)
        .json({ success: false, error: "projectId and gameName required" });
      return;
    }

    const generationResult = engine.generateFullPackage(
      projectId,
      gameName,
      genre ?? "adventure",
    );
    const assembly = assembler.assemble(
      generationResult,
      conceptId,
      pipelineId,
    );

    res.json({
      success: true,
      data: {
        ...assembly,
        generationResult: {
          totalScripts: generationResult.totalScripts,
          totalSizeBytes: generationResult.totalSizeBytes,
          generationTimeMs: generationResult.generationTimeMs,
          validationPassed: generationResult.validationPassed,
        },
      },
    });
  });

  // POST /api/lua/generate-assets — generate asset package
  router.post("/generate-assets", (req, res) => {
    const { projectId, gameName, genre, systems } = req.body;

    if (!projectId || !gameName) {
      res
        .status(400)
        .json({ success: false, error: "projectId and gameName required" });
      return;
    }

    const result = assetEngine.generate({
      projectId,
      gameName,
      genre: genre ?? "adventure",
      systems: systems ?? ["gameplay"],
    });

    res.json({ success: true, data: result });
  });

  return router;
}
