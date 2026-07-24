import { Router } from "express";
import { GameGenerationService } from "../projects/services/game-generation.service";
import type { GenerationExecution } from "../projects/types/blueprint";
import type { StudioRuntime } from "../studio/v2/StudioRuntime";
import type { ProjectRuntime } from "./projects";

type StudioConnectionStatus =
  | "connected"
  | "disconnected"
  | "syncing"
  | "error";

interface StudioConnectionInfo {
  status: StudioConnectionStatus;
  studioId?: string;
  lastSyncAt?: string;
  bridgeVersion: string;
  message?: string;
  pendingChanges: number;
  executionId?: string;
  artifactCount?: number;
}

interface StudioSyncResult extends StudioConnectionInfo {
  itemsSynced: number;
  itemsPrepared: number;
  durationMs: number;
  commandId: string;
  artifactIds: string[];
}

export function createGameGenerationRouter(
  gameService: GameGenerationService,
  studioRuntime: StudioRuntime,
  projectRuntime: ProjectRuntime,
): Router {
  const router = Router();
  const { projectRepository, generationHistory, access } = projectRuntime;

  const findLatestCompletedExecution = async (
    projectId: string,
  ): Promise<GenerationExecution | null> => {
    const blueprint = await gameService.getBlueprintByProject(projectId);
    if (!blueprint) return null;

    const executions = await gameService.getExecutions(blueprint.id);
    return (
      executions
        .filter((execution) => execution.status === "completed")
        .sort(
          (left, right) =>
            (right.completed_at ?? right.started_at).getTime() -
            (left.completed_at ?? left.started_at).getTime(),
        )[0] ?? null
    );
  };

  // Start generation
  router.post("/:projectId/generate", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!access.requireProjectAccess(req, res, projectId)) return;
      const userId = access.getRequestUserId(req);
      if (!userId) return;
      const { blueprintId } = req.body;

      // Auto-create a minimal blueprint if one doesn't exist yet.
      // This enables the workflow: Create Project → Generate without manual blueprint creation.
      const existingBlueprint =
        (await gameService.getBlueprint(blueprintId || projectId)) ??
        (await gameService.getBlueprintByProject(projectId));

      if (!existingBlueprint) {
        await gameService.createBlueprint(userId, projectId, {
          name: `Project ${projectId}`,
          description: "Auto-generated blueprint for pipeline execution",
          genre: "adventure",
          type: "game",
        } as never);
      }

      const result = await gameService.startGeneration(
        blueprintId || projectId,
        userId,
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
      if (!access.requireProjectAccess(req, res, projectId)) return;
      const userId = access.getRequestUserId(req);
      if (!userId) return;
      const input = { ...(req.body as Record<string, unknown>) };
      delete input.userId;
      const blueprint = await gameService.createBlueprint(
        userId,
        projectId,
        input as never,
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
      if (!access.requireProjectAccess(req, res, blueprint.project_id)) return;
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
      if (!access.requireProjectAccess(req, res, blueprint.project_id)) return;
      const validation = gameService.validateBlueprint(blueprint);
      res.json({ success: true, ...validation });
    } catch (error) {
      res.status(500).json({ success: false, error: "Validation failed" });
    }
  });

  // Get generation status
  router.get("/:projectId/generation/:executionId/status", async (req, res) => {
    try {
      if (!access.requireProjectAccess(req, res, req.params.projectId)) return;
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
      if (!access.requireProjectAccess(req, res, blueprint.project_id)) return;
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

  // Studio v2 connection and real artifact readiness for the project.
  router.get("/:projectId/studio/status", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!access.requireProjectAccess(req, res, projectId)) return;
      const clientId = req.query.studioId as string | undefined;
      const execution = await findLatestCompletedExecution(projectId);
      const connection = studioRuntime.getProjectConnection(
        projectId,
        execution?.id,
        clientId,
      );

      const response: StudioConnectionInfo = {
        status: connection.status,
        studioId: connection.clientId,
        lastSyncAt: undefined,
        bridgeVersion: "2.0.0",
        pendingChanges: connection.pendingChanges,
        executionId: connection.executionId,
        artifactCount: connection.artifactCount,
        message: connection.message,
      };

      res.json({ success: true, data: response });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to load Studio status" });
    }
  });

  // Prepare the latest real generated artifact snapshot for Studio retrieval.
  // Import acknowledgement is intentionally deferred to STUDIO-1c.
  router.post("/:projectId/studio/sync", async (req, res) => {
    const startedAt = Date.now();
    try {
      const { projectId } = req.params;
      if (!access.requireProjectAccess(req, res, projectId)) return;
      const clientId =
        typeof req.body?.studioId === "string" ? req.body.studioId : undefined;
      const execution = await findLatestCompletedExecution(projectId);

      if (!execution) {
        res.status(409).json({
          success: false,
          error: "No completed generation execution is available to synchronize.",
        });
        return;
      }

      const snapshot = studioRuntime.getProjectSnapshot(execution.id);
      if (!snapshot || snapshot.artifactCount === 0) {
        res.status(409).json({
          success: false,
          error: "The latest completed execution has no generated artifacts.",
        });
        return;
      }

      const prepared = studioRuntime.prepareProjectSync(
        projectId,
        execution.id,
        clientId,
      );
      if (!prepared) {
        res.status(404).json({
          success: false,
          error: "No active Studio v2 session is connected to this project.",
        });
        return;
      }

      const response: StudioSyncResult = {
        status: "syncing",
        studioId: prepared.clientId,
        lastSyncAt: undefined,
        bridgeVersion: "2.0.0",
        pendingChanges: prepared.artifactCount,
        executionId: prepared.executionId,
        artifactCount: prepared.artifactCount,
        itemsSynced: 0,
        itemsPrepared: prepared.artifactCount,
        durationMs: Date.now() - startedAt,
        commandId: prepared.commandId,
        artifactIds: prepared.artifactIds,
        message:
          "Real generated artifacts are prepared for Studio plugin retrieval. Import acknowledgement is pending.",
      };

      res.json({ success: true, data: response });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Studio synchronization failed" });
    }
  });

  // Download a portable project manifest. The Studio runtime consumes the same
  // durable blueprint, execution, and artifact lineage for live sessions.
  router.get("/:projectId/export", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!access.requireProjectAccess(req, res, projectId)) return;
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
