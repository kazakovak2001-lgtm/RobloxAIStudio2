/**
 * Domain Intelligence API — Roblox genre knowledge and benchmarking.
 */

import { Router } from "express";
import { DomainEngine } from "../domain";
import type { GameGenre } from "../domain";

export function createDomainRouter(): Router {
  const router = Router();
  const engine = new DomainEngine();

  // GET /api/domain/genres
  router.get("/genres", (_req, res) => {
    res.json({ success: true, data: engine.genres.getAll() });
  });

  // GET /api/domain/genres/:genre
  router.get("/genres/:genre", (req, res) => {
    const blueprint = engine.genres.get(req.params.genre as GameGenre);
    if (!blueprint) {
      res.status(404).json({ success: false, error: "Genre not found" });
      return;
    }
    res.json({ success: true, data: blueprint });
  });

  // GET /api/domain/patterns — best practices
  router.get("/patterns", (req, res) => {
    const category = req.query.category as string | undefined;
    const practices = category
      ? engine.bestPractices.getByCategory(category)
      : engine.bestPractices.getAll();
    res.json({
      success: true,
      data: practices,
      categories: engine.bestPractices.getCategories(),
    });
  });

  // GET /api/domain/recommendations
  router.get("/recommendations", (req, res) => {
    const genre = (req.query.genre as GameGenre) ?? "adventure";
    const recs = engine.getRecommendations(genre);
    res.json({ success: true, data: recs });
  });

  // POST /api/domain/analyze — benchmark against genre
  router.post("/analyze", (req, res) => {
    const input = req.body;
    if (!input.genre) {
      res.status(400).json({ success: false, error: "genre is required" });
      return;
    }
    const result = engine.analyze(input);
    res.json({ success: true, data: result });
  });

  return router;
}
