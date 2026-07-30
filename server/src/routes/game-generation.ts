import { Router } from "express";
import { GameGenerationService } from "../projects/services/game-generation.service";
import type { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import type {
  ArtifactVerificationStatus,
  StudioProjectSession,
} from "../studio/integration/types";
import type { ProjectRuntime } from "./projects";
import { ProjectGenerationStartCoordinator } from "../platform/projects/ProjectLifecycleCoordinator";

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
  artifactVerified?: boolean;
  verificationStatus?: ArtifactVerificationStatus;
  lastCommandId?: string;
  verifiedExecutionId?: string;
  verifiedArtifactCount?: number;
  verificationError?: string;
}

interface StudioSyncResult extends StudioConnectionInfo {
  itemsSynced: number;
  durationMs: number;
  executionId?: string;
  commandId?: string;
}

export function createGameGenerationRouter(
  gameService: GameGenerationService,
  studioManager: StudioIntegrationManager,
  projectRuntime: ProjectRuntime,
): Router {
  const router = Router();
  const { projectRepository, generationHistory, access } = projectRuntime;
  const generationStartCoordinator = new ProjectGenerationStartCoordinator(
    projectRepository,
  );

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

  const describeStudioSession = (
    session: StudioProjectSession | null,
    pendingChanges: number,
  ): string => {
    if (!session) {
      return "No connected Studio instance found for this project.";
    }
    switch (session.verificationStatus) {
      case "verified":
        return "Roblox Studio verified the generated project artifacts.";
      case "failed":
        return (
          session.verificationError ??
          "Roblox Studio reported an artifact import failure."
        );
      case "acknowledged":
        return "Roblox Studio acknowledged the export and is applying artifacts.";
      case "delivered":
        return "The generated export was delivered to Roblox Studio and awaits acknowledgement.";
      case "queued":
        return "Generated project artifacts are queued for Roblox Studio.";
      default:
        return pendingChanges > 0
          ? "Generated project artifacts are queued for Roblox Studio."
          : "Roblox Studio is connected to the project.";
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

  const findLatestStudioExecution = async (projectId: string) => {
    const blueprint = await gameService.getBlueprintByProject(projectId);
    if (!blueprint) return null;
    const executions = await gameService.getExecutions(blueprint.id);
    return (
      executions
        .filter(
          (execution) =>
            execution.status === "completed" &&
            studioManager.getArtifactCount(execution.id) > 0,
        )
        .sort(
          (left, right) =>
            (right.completed_at?.getTime() ?? right.started_at.getTime()) -
            (left.completed_at?.getTime() ?? left.started_at.getTime()),
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

      const result = await generationStartCoordinator.start(
        projectId,
        () => gameService.startGeneration(blueprintId || projectId, userId),
        async (execution) => {
          await generationHistory.record({
            id: execution.id,
            projectId,
            pipelineId: execution.id,
            status: execution.status,
            startedAt: execution.started_at.getTime(),
            stagesCompleted: 0,
            stagesTotal: 0,
            failures: 0,
            tokenUsage: 0,
            aiCost: 0,
          });
        },
      );
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
      await generationHistory.record({
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
        await projectRepository.updateDurable(execution.project_id, {
          status: "ready",
          qualityScore: 100,
        });
      } else if (execution.status === "failed") {
        await projectRepository.updateDurable(execution.project_id, {
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

  // Studio bridge status for the project
  router.get("/:projectId/studio/status", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!access.requireProjectAccess(req, res, projectId)) return;
      const studioId = req.query.studioId as string | undefined;
      const session = findStudioSession(projectId, studioId);
      const pendingChanges = session
        ? studioManager.getPendingCommandCount(session.studioId)
        : 0;

      const response: StudioConnectionInfo = {
        status: mapStudioStatus(session),
        studioId: session?.studioId,
        lastSyncAt: session?.lastSyncAt
          ? new Date(session.lastSyncAt).toISOString()
          : undefined,
        bridgeVersion: studioManager.protocolVersion,
        pendingChanges,
        artifactVerified: session?.artifactVerified ?? false,
        verificationStatus: session?.verificationStatus ?? "idle",
        lastCommandId: session?.lastCommandId,
        verifiedExecutionId: session?.verifiedExecutionId,
        verifiedArtifactCount: session?.verifiedArtifactCount,
        verificationError: session?.verificationError,
        message: describeStudioSession(session, pendingChanges),
      };

      res.json({ success: true, data: response });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to load Studio status" });
    }
  });

  // Queue the latest canonical execution artifacts for Roblox Studio
  router.post("/:projectId/studio/sync", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!access.requireProjectAccess(req, res, projectId)) return;
      const { studioId } = req.body;
      const session = findStudioSession(projectId, studioId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: "No connected Studio session available for this project.",
        });
        return;
      }

      const execution = await findLatestStudioExecution(projectId);
      if (!execution) {
        res.status(409).json({
          success: false,
          error:
            "No completed generation with Studio artifacts is available. Generate the project first.",
        });
        return;
      }

      const syncResult = studioManager.synchronizeExecution(
        session.studioId,
        projectId,
        execution.id,
      );
      const refreshedSession = studioManager.getSession(session.studioId);
      const pendingChanges = studioManager.getPendingCommandCount(
        session.studioId,
      );
      const response: StudioSyncResult = {
        status: mapStudioStatus(refreshedSession),
        studioId: session.studioId,
        lastSyncAt: refreshedSession?.lastSyncAt
          ? new Date(refreshedSession.lastSyncAt).toISOString()
          : undefined,
        bridgeVersion: studioManager.protocolVersion,
        pendingChanges,
        itemsSynced: syncResult.itemsSynced,
        durationMs: syncResult.durationMs,
        executionId: execution.id,
        commandId: syncResult.payloadId || refreshedSession?.lastCommandId,
        artifactVerified: refreshedSession?.artifactVerified ?? false,
        verificationStatus: refreshedSession?.verificationStatus ?? "idle",
        lastCommandId: refreshedSession?.lastCommandId,
        verifiedExecutionId: refreshedSession?.verifiedExecutionId,
        verifiedArtifactCount: refreshedSession?.verifiedArtifactCount,
        verificationError: refreshedSession?.verificationError,
        message: syncResult.success
          ? describeStudioSession(refreshedSession, pendingChanges)
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
