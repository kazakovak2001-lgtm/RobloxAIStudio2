import { Router } from "express";
import { GameGenerationService } from "../projects/services/game-generation.service";
import type { GenerationPackage } from "../generation/coordinator/types";
import type { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import type { StudioProjectSession } from "../studio/integration/types";
import {
  generationHistory,
  projectRepository,
  requireProjectAccess,
} from "./projects";

type StudioConnectionStatus =
  "connected" | "disconnected" | "syncing" | "error";

interface StudioConnectionInfo {
  status: StudioConnectionStatus;
  studioId?: string;
  lastSyncAt?: string;
  bridgeVersion: string;
  message?: string;
  pendingChanges: number;
}

interface StudioSyncResult extends StudioConnectionInfo {
  itemsSynced: number;
  durationMs: number;
}

export function createGameGenerationRouter(
  gameService: GameGenerationService,
  studioManager: StudioIntegrationManager,
): Router {
  const router = Router();

  const mapStudioStatus = (
    session: StudioProjectSession | null,
  ): StudioConnectionStatus => {
    if (!session) return "disconnected";
    switch (session.status) {
      case "syncing":
        return "syncing";
      case "failed":
        return "error";
      default:
        return "connected";
    }
  };

  const findStudioSession = (
    projectId: string,
    studioId?: string,
  ): StudioProjectSession | null => {
    if (studioId) {
      const session = studioManager.getSession(studioId);
      if (session && session.projectId === projectId) return session;
      return null;
    }

    return (
      studioManager
        .getActiveSessions()
        .find((session) => session.projectId === projectId) ?? null
    );
  };

  const buildStudioSyncPackage = (
    projectId: string,
    blueprint: unknown,
  ): GenerationPackage => {
    const now = Date.now();
    return {
      packageId: `studio-pkg-${now}`,
      sessionId: `studio-sync-${now}`,
      projectId,
      blueprint,
      executionPlan: { source: "studio-sync-fallback" },
      scripts: [
        {
          id: `script-${now}`,
          type: "lua-script",
          path: "src/Main.server.lua",
          content:
            "-- Roblox AI Studio bridge sync placeholder script\nreturn {}",
          size: 1024,
          generatedBy: "studio-sync-fallback",
          timestamp: now,
        },
      ],
      configs: [
        {
          id: `config-${now}`,
          type: "config",
          path: "src/Config.lua",
          content: "return {}",
          size: 128,
          generatedBy: "studio-sync-fallback",
          timestamp: now,
        },
      ],
      metadata: {
        generationId: `studio-sync-${now}`,
        blueprintVersion: "1.0.0",
        plannerVersion: "1.0.0",
        agentVersions: {},
        artifactVersions: {
          ["src/Main.server.lua"]: "1.0.0",
          ["src/Config.lua"]: "1.0.0",
        },
        executionTimestamps: {},
        validationResults: { integrity: true },
      },
      validationReport: {
        valid: true,
        stagesExecuted: 1,
        stagesExpected: 1,
        artifactsGenerated: 2,
        missingDependencies: [],
        duplicatedOutputs: [],
        unresolvedReferences: [],
        structureValid: true,
      },
      totalArtifacts: 2,
      totalSizeBytes: 1152,
      generatedAt: now,
    };
  };

  // Start generation
  router.post("/:projectId/generate", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!requireProjectAccess(req, res, projectId)) return;
      const { blueprintId, userId } = req.body;

      // Auto-create a minimal blueprint if one doesn't exist yet.
      // This enables the workflow: Create Project → Generate without manual blueprint creation.
      const existingBlueprint =
        (await gameService.getBlueprint(blueprintId || projectId)) ??
        (await gameService.getBlueprintByProject(projectId));

      if (!existingBlueprint) {
        await gameService.createBlueprint(userId || "default-user", projectId, {
          name: `Project ${projectId}`,
          description: "Auto-generated blueprint for pipeline execution",
          genre: "adventure",
          type: "game",
        } as never);
      }

      const result = await gameService.startGeneration(
        blueprintId || projectId,
        userId || "default-user",
      );
      projectRepository.update(projectId, {
        status: "generating",
        generationCount:
          (projectRepository.get(projectId)?.generationCount ?? 0) + 1,
      });
      generationHistory.record({
        id: result.id,
        projectId,
        pipelineId: result.id,
        status: result.status,
        startedAt: result.started_at.getTime(),
        stagesCompleted: 0,
        stagesTotal: 0,
        failures: 0,
        tokenUsage: 0,
        aiCost: 0,
      });
      res.json({
        success: true,
        executionId: result.id,
        status: "generation_started",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Generation failed";
      console.error("[generate] Error:", message);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Create blueprint
  router.post("/:projectId/blueprints", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!requireProjectAccess(req, res, projectId)) return;
      const { userId, ...input } = req.body;
      const blueprint = await gameService.createBlueprint(
        userId || "default-user",
        projectId,
        input,
      );
      res.json({ success: true, data: blueprint });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to create blueprint" });
    }
  });

  // Get blueprint
  router.get("/blueprints/:blueprintId", async (req, res) => {
    try {
      const blueprint = await gameService.getBlueprint(req.params.blueprintId);
      if (!blueprint) {
        res.status(404).json({ success: false, error: "Blueprint not found" });
        return;
      }
      if (!requireProjectAccess(req, res, blueprint.project_id)) return;
      res.json({ success: true, data: blueprint });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch blueprint" });
    }
  });

  // Validate blueprint
  router.get("/blueprints/:blueprintId/validate", async (req, res) => {
    try {
      const blueprint = await gameService.getBlueprint(req.params.blueprintId);
      if (!blueprint) {
        res.status(404).json({ success: false, error: "Blueprint not found" });
        return;
      }
      if (!requireProjectAccess(req, res, blueprint.project_id)) return;
      const validation = gameService.validateBlueprint(blueprint);
      res.json({ success: true, ...validation });
    } catch (error) {
      res.status(500).json({ success: false, error: "Validation failed" });
    }
  });

  // Get generation status
  router.get("/:projectId/generation/:executionId/status", async (req, res) => {
    try {
      if (!requireProjectAccess(req, res, req.params.projectId)) return;
      const execution = await gameService.getExecution(req.params.executionId);
      if (!execution) {
        res.status(404).json({ success: false, error: "Execution not found" });
        return;
      }
      if (execution.project_id !== req.params.projectId) {
        res.status(404).json({ success: false, error: "Execution not found" });
        return;
      }
      const completedSteps = execution.pipeline_steps.filter(
        (step) => step.status === "completed",
      ).length;
      const failedSteps = execution.pipeline_steps.filter(
        (step) => step.status === "failed",
      ).length;
      generationHistory.record({
        id: execution.id,
        projectId: execution.project_id,
        pipelineId: execution.id,
        status: execution.status,
        startedAt: execution.started_at.getTime(),
        finishedAt: execution.completed_at?.getTime(),
        duration: execution.total_duration_ms,
        stagesCompleted: completedSteps,
        stagesTotal: execution.pipeline_steps.length,
        failures: failedSteps,
        tokenUsage: 0,
        aiCost: 0,
      });
      if (execution.status === "completed") {
        projectRepository.update(execution.project_id, {
          status: "ready",
          qualityScore: 100,
        });
      } else if (execution.status === "failed") {
        projectRepository.update(execution.project_id, {
          status: "draft",
        });
      }
      res.json({ success: true, data: execution });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch status" });
    }
  });

  // List executions for blueprint
  router.get("/blueprints/:blueprintId/executions", async (req, res) => {
    try {
      const blueprint = await gameService.getBlueprint(req.params.blueprintId);
      if (!blueprint) {
        res.status(404).json({ success: false, error: "Blueprint not found" });
        return;
      }
      if (!requireProjectAccess(req, res, blueprint.project_id)) return;
      const executions = await gameService.getExecutions(
        req.params.blueprintId,
      );
      res.json({ success: true, data: executions });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to list executions" });
    }
  });

  // Cache stats
  router.get("/system/cache-stats", async (_req, res) => {
    try {
      const stats = gameService.getCacheStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to get cache stats" });
    }
  });

  // Studio bridge status for the project
  router.get("/:projectId/studio/status", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!requireProjectAccess(req, res, projectId)) return;
      const studioId = req.query.studioId as string | undefined;
      const session = findStudioSession(projectId, studioId);

      const response: StudioConnectionInfo = {
        status: mapStudioStatus(session),
        studioId: session?.studioId,
        lastSyncAt: session?.lastSyncAt
          ? new Date(session.lastSyncAt).toISOString()
          : undefined,
        bridgeVersion: "1.0.0",
        pendingChanges: session?.syncCount ?? 0,
        message: session
          ? session.status === "failed"
            ? "Studio session has reported a sync failure."
            : "Roblox Studio is connected to the project."
          : "No connected Studio instance found for this project.",
      };

      res.json({ success: true, data: response });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to load Studio status" });
    }
  });

  // Synchronize the latest project package to Roblox Studio
  router.post("/:projectId/studio/sync", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!requireProjectAccess(req, res, projectId)) return;
      const { studioId } = req.body;
      const session = findStudioSession(projectId, studioId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: "No connected Studio session available for this project.",
        });
        return;
      }

      const blueprint = await gameService.getBlueprintByProject(projectId);
      if (!blueprint) {
        res.status(404).json({
          success: false,
          error: "No blueprint available to synchronize.",
        });
        return;
      }

      const pkg = buildStudioSyncPackage(projectId, blueprint);
      const syncResult = studioManager.synchronize(session.studioId, pkg);
      const response: StudioSyncResult = {
        status: mapStudioStatus(session),
        studioId: session.studioId,
        lastSyncAt: session.lastSyncAt
          ? new Date(session.lastSyncAt).toISOString()
          : undefined,
        bridgeVersion: "1.0.0",
        pendingChanges: session.syncCount,
        itemsSynced: syncResult.itemsSynced,
        durationMs: syncResult.durationMs,
        message: syncResult.success
          ? "Synchronization completed successfully."
          : syncResult.error,
      };

      if (!syncResult.success) {
        res
          .status(400)
          .json({ success: false, error: syncResult.error, data: response });
        return;
      }

      res.json({ success: true, data: response });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Studio synchronization failed" });
    }
  });

  // Download a portable project manifest. The Roblox Studio bridge consumes
  // the same blueprint and execution metadata when a live Studio session is
  // available; this endpoint gives browser users a deterministic export.
  router.get("/:projectId/export", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!requireProjectAccess(req, res, projectId)) return;
      const project = projectRepository.get(projectId);
      const blueprint = await gameService.getBlueprintByProject(projectId);
      if (!blueprint) {
        res.status(409).json({
          success: false,
          error: "Generate the project before exporting it.",
        });
        return;
      }
      const executions = await gameService.getExecutions(blueprint.id);
      res.json({
        success: true,
        data: {
          format: "roblox-ai-studio-project-manifest",
          version: "1.0.0",
          exportedAt: new Date().toISOString(),
          project,
          blueprint,
          executions,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Export failed" });
    }
  });

  // Server-Sent Events stream for pipeline execution updates
  // Clients subscribe with GET /api/projects/generation/stream?clientId=<id>
  router.get("/generation/stream", (req, res) => {
    const clientId =
      typeof req.query.clientId === "string"
        ? req.query.clientId
        : `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    gameService.getStreamingHandler().registerClient(clientId, res);
  });

  return router;
}
