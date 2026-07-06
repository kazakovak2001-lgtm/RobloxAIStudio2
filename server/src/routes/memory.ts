/**
 * memory.routes.ts
 *
 * API exposure layer for the persistent memory system.
 */

import { Router } from "express";
import { MemoryEngine } from "../memory/core/MemoryEngine";

export function createMemoryRouter(): Router {
  const router = Router();
  const engine = new MemoryEngine();

  // GET /memory/:agentId — get recent memory entries for an agent
  router.get("/:agentId", (req, res) => {
    const { agentId } = req.params;
    const projectId = req.query.projectId as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? "10", 10);

    const entries = engine.getStore().getByAgent(agentId, projectId, limit);
    res.json({
      success: true,
      data: { agentId, entries, count: entries.length },
    });
  });

  // POST /memory/store — store a memory entry manually
  router.post("/store", async (req, res) => {
    try {
      const { agentId, projectId, input, output, tags } = req.body;
      await engine.storeMemory({
        agentId: agentId ?? "manual",
        projectId,
        input: input ?? {},
        output: output ?? {},
        timestamp: new Date(),
        tags,
      });
      res.json({ success: true, message: "Memory stored" });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to store memory" });
    }
  });

  // POST /memory/search — semantic search over memory
  router.post("/search", async (req, res) => {
    try {
      const { agentId, query, projectId, limit } = req.body;
      const result = await engine.retrieveMemory(
        agentId ?? "*",
        query ?? "",
        projectId,
        limit ?? 5,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: "Memory search failed" });
    }
  });

  // GET /memory/stats — get memory system stats
  router.get("/system/stats", (_req, res) => {
    const storeStats = engine.getStore().getStats();
    const semanticCount = engine.getSemantic().indexedCount;
    res.json({
      success: true,
      data: { store: storeStats, semanticIndexed: semanticCount },
    });
  });

  return router;
}
