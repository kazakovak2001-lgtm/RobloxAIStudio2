/**
 * Game Architect API — transforms user game ideas into production specifications.
 */

import { Router } from "express";
import { GameArchitect } from "../ai/gameArchitect";
import type { GameIdeaInput } from "../ai/gameArchitect";
import { requireApiKeyCapability } from "../common/middleware/security";

export function createGameArchitectRouter(): Router {
  const router = Router();
  const architect = new GameArchitect();

  // POST /api/ai/game-architect/analyze
  router.post("/analyze", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.game-architect.analysis.execute",
        "request-game-idea",
      )
    ) {
      return;
    }
    const input = req.body as GameIdeaInput;

    if (
      !input.description ||
      typeof input.description !== "string" ||
      input.description.trim().length < 5
    ) {
      res.status(400).json({
        success: false,
        error: "description is required (minimum 5 characters)",
      });
      return;
    }

    const analysis = architect.analyze(input);
    res.json({ success: true, data: analysis });
  });

  // POST /api/ai/game-architect/generate-design
  router.post("/generate-design", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.game-architect.design.generate",
        "request-game-idea",
      )
    ) {
      return;
    }
    const input = req.body as GameIdeaInput;

    if (
      !input.description ||
      typeof input.description !== "string" ||
      input.description.trim().length < 5
    ) {
      res.status(400).json({
        success: false,
        error: "description is required (minimum 5 characters)",
      });
      return;
    }

    const analysis = architect.analyze(input);
    const design = architect.generateDesign(input, analysis);
    const architecture = architect.planArchitecture(analysis);

    res.json({ success: true, data: { analysis, design, architecture } });
  });

  // POST /api/ai/game-architect/generate-prompts
  router.post("/generate-prompts", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.game-architect.prompts.generate",
        "request-game-idea",
      )
    ) {
      return;
    }
    const input = req.body as GameIdeaInput;

    if (
      !input.description ||
      typeof input.description !== "string" ||
      input.description.trim().length < 5
    ) {
      res.status(400).json({
        success: false,
        error: "description is required (minimum 5 characters)",
      });
      return;
    }

    const result = architect.process(input);
    res.json({ success: true, data: result });
  });

  return router;
}
