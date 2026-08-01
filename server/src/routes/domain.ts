/**
 * Domain Intelligence API — Roblox genre knowledge and benchmarking.
 */

import { Router } from "express";
import { DomainEngine } from "../domain";
import type { GameGenre } from "../domain";
import { requireApiKeyCapability } from "../common/middleware/security";

export function createDomainRouter(): Router {
  const router = Router();
  const engine = new DomainEngine();

  // GET /api/domain/genres
  router.get("/genres", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.domain.genres.list",
        "domain-taxonomy",
      )
    ) {
      return;
    }
    res.json({ success: true, data: engine.genres.getAll() });
  });

  // GET /api/domain/genres/:genre
  router.get("/genres/:genre", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.domain.genre.read",
        "domain-taxonomy",
      )
    ) {
      return;
    }
    const blueprint = engine.genres.get(req.params.genre as GameGenre);
    if (!blueprint) {
      res.status(404).json({ success: false, error: "Genre not found" });
      return;
    }
    res.json({ success: true, data: blueprint });
  });

  // GET /api/domain/patterns — best practices
  router.get("/patterns", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.domain.patterns.read",
        "domain-knowledge",
      )
    ) {
      return;
    }
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
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.domain.recommendations.read",
        "domain-knowledge",
      )
    ) {
      return;
    }
    const genre = (req.query.genre as GameGenre) ?? "adventure";
    const recs = engine.getRecommendations(genre);
    res.json({ success: true, data: recs });
  });

  // POST /api/domain/analyze — benchmark against genre
  router.post("/analyze", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.domain.analysis.execute",
        "request-domain-input",
      )
    ) {
      return;
    }
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
