/**
 * Knowledge API — AI Learning & Pattern retrieval.
 */

import { Router } from "express";
import { KnowledgeEngine } from "../knowledge";
import type { ProjectAccessControl } from "./projects";
import { requireApiKeyCapability } from "../common/middleware/security";

export function createKnowledgeRouter(access: ProjectAccessControl): Router {
  const router = Router();
  const engine = new KnowledgeEngine();

  // GET /api/knowledge/patterns
  router.get("/patterns", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.knowledge.patterns.read",
        "knowledge-pattern-registry",
      )
    ) {
      return;
    }
    const type = req.query.type as string | undefined;
    const patterns = type
      ? engine.patterns.getByType(type as never)
      : engine.patterns.getAll();
    res.json({ success: true, data: patterns });
  });

  // GET /api/knowledge/prompts
  router.get("/prompts", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.knowledge.prompts.read",
        "knowledge-prompt-registry",
      )
    ) {
      return;
    }
    const agent = req.query.agent as string | undefined;
    const prompts = agent
      ? engine.prompts.getByAgent(agent)
      : engine.prompts.getTopPrompts(20);
    res.json({
      success: true,
      data: prompts,
      stats: engine.prompts.getStats(),
    });
  });

  // GET /api/knowledge/search
  router.get("/search", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.knowledge.search",
        "knowledge-runtime",
      )
    ) {
      return;
    }
    const genre = req.query.genre as string | undefined;
    const systems = req.query.systems
      ? (req.query.systems as string).split(",")
      : undefined;
    const results = engine.search({ genre, systems });
    res.json({ success: true, data: results });
  });

  // POST /api/knowledge/store — store a generation record for learning
  router.post("/store", async (req, res) => {
    const record = req.body;
    if (!record.projectId) {
      res.status(400).json({ success: false, error: "projectId required" });
      return;
    }
    if (!(await access.requireProjectAccess(req, res, record.projectId)))
      return;
    engine.learn(record);
    res.json({ success: true });
  });

  // GET /api/knowledge/recommend
  router.get("/recommend", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.knowledge.recommendations.read",
        "knowledge-runtime",
      )
    ) {
      return;
    }
    const genre = (req.query.genre as string) ?? "adventure";
    const systems = req.query.systems
      ? (req.query.systems as string).split(",")
      : [];
    const recommendations = engine.getRecommendations(genre, systems);
    res.json({ success: true, data: recommendations });
  });

  return router;
}
