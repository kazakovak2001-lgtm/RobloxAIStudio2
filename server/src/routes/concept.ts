/**
 * Concept & Experience generation API.
 */

import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { randomUUID } from "crypto";
import { PipelineEngine } from "../pipeline/v2/PipelineEngine";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import type { GenerationHistoryRepository } from "../projects/repository/generationHistory.repository";
import { DurableStorageError } from "../platform/storage/StorageProvider";

export function createConceptRouter(
  agentRegistry: AgentRegistry,
  generationHistory: GenerationHistoryRepository,
): Router {
  const router = Router();
  const pipelineEngine = new PipelineEngine();

  // In-memory concept store (production would use DB)
  const concepts = new Map<string, Record<string, unknown>>();

  // POST /api/concept/generate
  router.post("/generate", (req, res) => {
    const {
      gameDescription,
      genre,
      style,
      targetAudience,
      additionalRequirements,
    } = req.body;

    if (
      !gameDescription ||
      typeof gameDescription !== "string" ||
      gameDescription.trim().length < 5
    ) {
      res.status(400).json({
        success: false,
        error: "gameDescription is required (min 5 chars)",
      });
      return;
    }

    const conceptId = `concept-${randomUUID().slice(0, 10)}`;
    const title = extractTitle(gameDescription);

    const concept = {
      conceptId,
      title,
      description: gameDescription.trim(),
      genre: genre ?? "adventure",
      style: style ?? "casual",
      targetAudience: targetAudience ?? "all ages",
      gameplayLoop: `Players engage in ${genre ?? "adventure"} gameplay with progressive challenges`,
      features: generateFeatures(genre ?? "adventure"),
      assetsPlan: ["3D models", "Textures", "Sound effects", "Animations"],
      systemsPlan: [
        "Player management",
        "Game state",
        "Networking",
        "Data persistence",
      ],
      uiPlan: ["Main menu", "HUD", "Settings", "Inventory"],
      technicalPlan: {
        architecture: "Client-Server",
        requiredAgents: [
          "requirements",
          "game_designer",
          "roblox_architect",
          "lua_generator",
          "ui_generator",
          "asset_planner",
        ],
        estimatedStages: 11,
      },
      additionalRequirements: additionalRequirements ?? "",
      createdAt: Date.now(),
    };

    concepts.set(conceptId, concept);
    res.json({ success: true, data: concept });
  });

  // GET /api/concept/:id
  router.get("/:id", (req, res) => {
    const concept = concepts.get(req.params.id);
    if (!concept) {
      res.status(404).json({ success: false, error: "Concept not found" });
      return;
    }
    res.json({ success: true, data: concept });
  });

  // POST /api/experience/generate
  router.post("/experience/generate", async (req, res) => {
    const { conceptId } = req.body;
    const concept = concepts.get(conceptId);

    if (!concept) {
      res.status(404).json({
        success: false,
        error: "Concept not found. Generate a concept first.",
      });
      return;
    }

    try {
      const result = await pipelineEngine.run(
        conceptId,
        concept as Record<string, unknown>,
        (agentType, input) => agentRegistry.executeAgent(agentType, input),
      );

      res.json({
        success: true,
        data: {
          pipelineId: result.state.pipelineId,
          status: result.state.status,
          completedStages: result.state.completedStages,
          failedStages: result.state.failedStages,
          durationMs: result.durationMs,
          stageCount: result.state.stages.length,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "Pipeline execution failed",
      });
    }
  });

  // GET /api/concept/experience/status/:pipelineId
  router.get("/experience/status/:pipelineId", (req, res) => {
    const state = pipelineEngine.getState(req.params.pipelineId);
    if (!state) {
      res.status(404).json({ success: false, error: "Pipeline not found" });
      return;
    }
    res.json({ success: true, data: state });
  });

  // POST /api/concept/experience/:pipelineId/pause
  router.post("/experience/:pipelineId/pause", (req, res) => {
    const success = pipelineEngine.pause(req.params.pipelineId);
    if (!success) {
      res
        .status(400)
        .json({ success: false, error: "Cannot pause pipeline (not running)" });
      return;
    }
    res.json({ success: true, data: { status: "paused" } });
  });

  // POST /api/concept/experience/:pipelineId/resume
  router.post("/experience/:pipelineId/resume", async (req, res) => {
    const { pipelineId } = req.params;
    const state = pipelineEngine.getState(pipelineId);
    if (!state) {
      res.status(404).json({ success: false, error: "Pipeline not found" });
      return;
    }
    // Find the concept to get blueprint
    const concept = concepts.get(state.projectId);
    const blueprint = (concept as Record<string, unknown>) ?? {};

    try {
      const result = await pipelineEngine.resumePaused(
        pipelineId,
        blueprint,
        (agentType, input) => agentRegistry.executeAgent(agentType, input),
      );
      if (!result) {
        res.status(400).json({
          success: false,
          error: "Cannot resume pipeline (not paused)",
        });
        return;
      }
      res.json({
        success: true,
        data: { status: result.state.status, pipelineId },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "Resume failed",
      });
    }
  });

  // POST /api/concept/experience/:pipelineId/cancel
  router.post("/experience/:pipelineId/cancel", (req, res) => {
    const success = pipelineEngine.cancel(req.params.pipelineId);
    if (!success) {
      res.status(400).json({
        success: false,
        error: "Cannot cancel pipeline (not running or paused)",
      });
      return;
    }
    res.json({ success: true, data: { status: "cancelled" } });
  });

  // POST /api/concept/experience/:pipelineId/retry
  router.post("/experience/:pipelineId/retry", async (req, res) => {
    const { pipelineId } = req.params;
    const state = pipelineEngine.getState(pipelineId);
    if (!state) {
      res.status(404).json({ success: false, error: "Pipeline not found" });
      return;
    }
    const concept = concepts.get(state.projectId);
    const blueprint = (concept as Record<string, unknown>) ?? {};

    try {
      const result = await pipelineEngine.retry(
        pipelineId,
        blueprint,
        (agentType, input) => agentRegistry.executeAgent(agentType, input),
      );
      if (!result) {
        res.status(400).json({
          success: false,
          error: "Cannot retry pipeline (not failed)",
        });
        return;
      }
      res.json({
        success: true,
        data: { status: result.state.status, pipelineId },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "Retry failed",
      });
    }
  });

  // POST /api/concept/experience/:pipelineId/stage/:stage/retry
  router.post(
    "/experience/:pipelineId/stage/:stage/retry",
    async (req, res) => {
      const { pipelineId, stage } = req.params;
      const state = pipelineEngine.getState(pipelineId);
      if (!state) {
        res.status(404).json({ success: false, error: "Pipeline not found" });
        return;
      }
      const concept = concepts.get(state.projectId);
      const blueprint = (concept as Record<string, unknown>) ?? {};

      try {
        const result = await pipelineEngine.retryStage(
          pipelineId,
          stage,
          blueprint,
          (agentType, input) => agentRegistry.executeAgent(agentType, input),
        );
        if (!result) {
          res.status(400).json({
            success: false,
            error: `Cannot retry stage ${stage} (not failed)`,
          });
          return;
        }
        res.json({
          success: true,
          data: { status: result.state.status, stage },
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : "Stage retry failed",
        });
      }
    },
  );

  // GET /api/concept/experience/history
  router.get("/experience/history", (_req, res) => {
    const history: Array<{
      pipelineId: string;
      projectId: string;
      status: string;
      startedAt: number;
      finishedAt?: number;
      completedStages: string[];
      failedStages: string[];
      stageCount: number;
    }> = [];

    for (const [conceptId] of concepts.entries()) {
      // Find all pipeline runs associated with this concept
      const pipelineState = pipelineEngine.getState(conceptId);
      if (!pipelineState) continue;
      history.push({
        pipelineId: pipelineState.pipelineId,
        projectId: pipelineState.projectId,
        status: pipelineState.status,
        startedAt: pipelineState.startedAt,
        finishedAt: pipelineState.finishedAt,
        completedStages: pipelineState.completedStages,
        failedStages: pipelineState.failedStages,
        stageCount: pipelineState.stages.length,
      });
    }

    // Also check all known pipeline runs
    const allRuns = pipelineEngine.getAllStates();
    for (const state of allRuns) {
      if (!history.find((h) => h.pipelineId === state.pipelineId)) {
        history.push({
          pipelineId: state.pipelineId,
          projectId: state.projectId,
          status: state.status,
          startedAt: state.startedAt,
          finishedAt: state.finishedAt,
          completedStages: state.completedStages,
          failedStages: state.failedStages,
          stageCount: state.stages.length,
        });
      }
    }

    // Sort by startedAt descending
    history.sort((a, b) => b.startedAt - a.startedAt);

    res.json({ success: true, data: history });
  });

  // GET /api/concept/experience/:pipelineId/artifacts
  router.get("/experience/:pipelineId/artifacts", (req, res) => {
    const { pipelineId } = req.params;
    const state = pipelineEngine.getState(pipelineId);
    if (!state) {
      res.status(404).json({ success: false, error: "Pipeline not found" });
      return;
    }

    const artifacts = pipelineEngine.getArtifacts(pipelineId);
    // Return without full content for list view (summary only)
    const summaries = artifacts.map((a) => ({
      id: a.id,
      pipelineId: a.pipelineId,
      stage: a.stage,
      agent: a.agent,
      type: a.type,
      name: a.name,
      createdAt: a.createdAt,
      sizeBytes: a.sizeBytes,
      validated: a.validated,
      reviewStatus: a.reviewStatus,
      reviewComment: a.reviewComment,
      reviewedAt: a.reviewedAt,
      reviewedBy: a.reviewedBy,
    }));

    res.json({ success: true, data: summaries });
  });

  // GET /api/concept/experience/artifact/:artifactId
  router.get("/experience/artifact/:artifactId", (req, res) => {
    const artifact = pipelineEngine.getArtifact(req.params.artifactId);
    if (!artifact) {
      res.status(404).json({ success: false, error: "Artifact not found" });
      return;
    }
    res.json({ success: true, data: artifact });
  });

  // POST /api/concept/experience/artifact/:artifactId/approve
  router.post(
    "/experience/artifact/:artifactId/approve",
    asyncArtifactMutation(async (req, res) => {
      const { reviewedBy } = req.body;
      const result = await pipelineEngine.approveArtifact(
        req.params.artifactId,
        reviewedBy ?? "user",
      );
      if (!result) {
        res.status(404).json({ success: false, error: "Artifact not found" });
        return;
      }
      res.json({
        success: true,
        data: { id: result.id, reviewStatus: result.reviewStatus },
      });
    }),
  );

  // POST /api/concept/experience/artifact/:artifactId/reject
  router.post(
    "/experience/artifact/:artifactId/reject",
    asyncArtifactMutation(async (req, res) => {
      const { reviewedBy, comment } = req.body;
      const result = await pipelineEngine.rejectArtifact(
        req.params.artifactId,
        reviewedBy ?? "user",
        comment,
      );
      if (!result) {
        res.status(404).json({ success: false, error: "Artifact not found" });
        return;
      }
      res.json({
        success: true,
        data: { id: result.id, reviewStatus: result.reviewStatus },
      });
    }),
  );

  // POST /api/concept/experience/artifact/:artifactId/comment
  router.post(
    "/experience/artifact/:artifactId/comment",
    asyncArtifactMutation(async (req, res) => {
      const { reviewedBy, comment } = req.body;
      if (!comment || typeof comment !== "string") {
        res.status(400).json({ success: false, error: "comment is required" });
        return;
      }
      const result = await pipelineEngine.commentArtifact(
        req.params.artifactId,
        reviewedBy ?? "user",
        comment,
      );
      if (!result) {
        res.status(404).json({ success: false, error: "Artifact not found" });
        return;
      }
      res.json({
        success: true,
        data: { id: result.id, reviewComment: result.reviewComment },
      });
    }),
  );

  // POST /api/concept/experience/artifact/:artifactId/edit
  router.post(
    "/experience/artifact/:artifactId/edit",
    asyncArtifactMutation(async (req, res) => {
      const { content, editedBy } = req.body;
      if (content === undefined) {
        res.status(400).json({ success: false, error: "content is required" });
        return;
      }
      const result = await pipelineEngine.editArtifact(
        req.params.artifactId,
        content,
        editedBy ?? "user",
      );
      if (!result) {
        res.status(404).json({ success: false, error: "Artifact not found" });
        return;
      }
      res.json({
        success: true,
        data: {
          id: result.id,
          reviewStatus: result.reviewStatus,
          sizeBytes: result.sizeBytes,
        },
      });
    }),
  );

  // GET /api/concept/experience/:pipelineId/review
  router.get("/experience/:pipelineId/review", (req, res) => {
    const state = pipelineEngine.getState(req.params.pipelineId);
    if (!state) {
      res.status(404).json({ success: false, error: "Pipeline not found" });
      return;
    }
    const summary = pipelineEngine.getReviewSummary(req.params.pipelineId);
    res.json({ success: true, data: summary });
  });

  // POST /api/concept/experience/generate-direct
  // Direct pipeline generation for workspace — no concept required.
  router.post("/experience/generate-direct", async (req, res) => {
    const { projectId } = req.body;

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }

    try {
      console.log(`[GENERATION_REQUEST] projectId=${projectId}`);

      const blueprint: Record<string, unknown> = {
        projectId,
        name: `Project ${projectId}`,
        description: "Direct pipeline execution",
        createdAt: Date.now(),
      };

      // Start pipeline asynchronously — return pipelineId immediately
      // so the frontend can begin polling without waiting for completion.
      const pipelineId = pipelineEngine.startAsync(
        projectId,
        blueprint,
        (agentType, input) => agentRegistry.executeAgent(agentType, input),
      );

      console.log(
        `[PIPELINE_CREATED] pipelineId=${pipelineId} projectId=${projectId}`,
      );

      // Record generation in project history
      await generationHistory.record({
        id: `gen-${randomUUID().slice(0, 8)}`,
        projectId,
        pipelineId,
        status: "running",
        startedAt: Date.now(),
        stagesCompleted: 0,
        stagesTotal: 11,
        failures: 0,
        tokenUsage: 0,
        aiCost: 0,
      });

      console.log(`[JOB_ENQUEUED] pipelineId=${pipelineId}`);

      res.json({
        success: true,
        data: {
          pipelineId,
          status: "running",
          completedStages: [],
          failedStages: [],
          stageCount: 11,
        },
      });
    } catch (error) {
      if (error instanceof DurableStorageError) {
        res.status(503).json({
          success: false,
          error: "Generation history temporarily unavailable",
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : "Direct generation failed";
      console.error("[generate-direct] Error:", message);
      res.status(500).json({ success: false, error: message });
    }
  });

  // GET /api/concept/experience/:pipelineId/metrics
  router.get("/experience/:pipelineId/metrics", (req, res) => {
    const metrics = pipelineEngine.getMetrics(req.params.pipelineId);
    if (!metrics) {
      res.status(404).json({ success: false, error: "Metrics not found" });
      return;
    }
    res.json({ success: true, data: metrics });
  });

  // GET /api/concept/experience/:pipelineId/audit
  router.get("/experience/:pipelineId/audit", (req, res) => {
    const history = pipelineEngine.getAuditHistory(req.params.pipelineId);
    res.json({ success: true, data: history });
  });

  return router;
}

function asyncArtifactMutation(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req, res) => {
    void handler(req, res).catch((error: unknown) => {
      handleArtifactMutationError(error, res);
    });
  };
}

function handleArtifactMutationError(error: unknown, res: Response): void {
  if (error instanceof DurableStorageError) {
    console.error("[concept] artifact mutation rejected", error);
    res.status(503).json({
      success: false,
      error: "Durable storage is temporarily unavailable",
    });
    return;
  }

  console.error("[concept] artifact mutation failed", error);
  res.status(500).json({ success: false, error: "Artifact mutation failed" });
}

function extractTitle(description: string): string {
  const words = description.trim().split(/\s+/).slice(0, 4);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function generateFeatures(genre: string): string[] {
  const base = ["Multiplayer support", "Save system", "Leaderboards"];
  const genreFeatures: Record<string, string[]> = {
    obby: ["Checkpoint system", "Stage progression", "Speed run timer"],
    rpg: ["Inventory system", "Quest system", "NPC interactions"],
    tycoon: ["Resource management", "Upgrades", "Automation"],
    simulator: ["Skill progression", "Collection mechanics", "Rebirth system"],
    adventure: ["Exploration", "Puzzle solving", "Story progression"],
  };
  return [
    ...base,
    ...(genreFeatures[genre.toLowerCase()] ?? genreFeatures.adventure),
  ];
}
