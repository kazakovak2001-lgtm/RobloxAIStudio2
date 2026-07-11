/**
 * Lua Generation API — Generate Roblox Lua script packages.
 */

import { Router } from "express";
import { LuaGenerationEngine } from "../generation/lua";
import type { GameplaySystem } from "../generation/lua";

export function createLuaGenerationRouter(): Router {
  const router = Router();
  const engine = new LuaGenerationEngine();

  // POST /api/lua/generate — generate a full script package
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

  return router;
}
