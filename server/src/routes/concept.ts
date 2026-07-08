/**
 * Concept & Experience generation API.
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { PipelineEngine } from "../pipeline/v2/PipelineEngine";
import { AgentRegistry } from "../agents/core/AgentRegistry";

export function createConceptRouter(agentRegistry: AgentRegistry): Router {
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
  router.post("/experience/artifact/:artifactId/approve", (req, res) => {
    const { reviewedBy } = req.body;
    const result = pipelineEngine.approveArtifact(
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
  });

  // POST /api/concept/experience/artifact/:artifactId/reject
  router.post("/experience/artifact/:artifactId/reject", (req, res) => {
    const { reviewedBy, comment } = req.body;
    const result = pipelineEngine.rejectArtifact(
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
  });

  // POST /api/concept/experience/artifact/:artifactId/comment
  router.post("/experience/artifact/:artifactId/comment", (req, res) => {
    const { reviewedBy, comment } = req.body;
    if (!comment || typeof comment !== "string") {
      res.status(400).json({ success: false, error: "comment is required" });
      return;
    }
    const result = pipelineEngine.commentArtifact(
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
  });

  // POST /api/concept/experience/artifact/:artifactId/edit
  router.post("/experience/artifact/:artifactId/edit", (req, res) => {
    const { content, editedBy } = req.body;
    if (content === undefined) {
      res.status(400).json({ success: false, error: "content is required" });
      return;
    }
    const result = pipelineEngine.editArtifact(
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
  });

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

  return router;
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
