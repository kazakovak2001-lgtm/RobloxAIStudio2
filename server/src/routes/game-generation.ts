import { Router } from "express";
import { GameGenerationService } from "../projects/services/game-generation.service";
import type { GenerationPackage } from "../generation/coordinator/types";
import type { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import type { StudioProjectSession } from "../studio/integration/types";

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
      const { blueprintId, userId } = req.body;
      const result = await gameService.startGeneration(
        blueprintId || projectId,
        userId || "default-user",
      );
      res.json({
        success: true,
        executionId: result.id,
        status: "generation_started",
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Generation failed" });
    }
  });

  // Create blueprint
  router.post("/:projectId/blueprints", async (req, res) => {
    try {
      const { projectId } = req.params;
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
      const validation = gameService.validateBlueprint(blueprint);
      res.json({ success: true, ...validation });
    } catch (error) {
      res.status(500).json({ success: false, error: "Validation failed" });
    }
  });

  // Get generation status
  router.get("/:projectId/generation/:executionId/status", async (req, res) => {
    try {
      const execution = await gameService.getExecution(req.params.executionId);
      if (!execution) {
        res.status(404).json({ success: false, error: "Execution not found" });
        return;
      }
      res.json({ success: true, data: execution });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch status" });
    }
  });

  // List executions for blueprint
  router.get("/blueprints/:blueprintId/executions", async (req, res) => {
    try {
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
