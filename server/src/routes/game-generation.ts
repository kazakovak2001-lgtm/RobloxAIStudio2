import { Router } from "express";
import {
  BlueprintProposalError,
  GameGenerationService,
} from "../projects/services/game-generation.service";
import type { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import type {
  ArtifactVerificationStatus,
  StudioProjectSession,
} from "../studio/integration/types";
import type { ProjectRuntime } from "./projects";
import {
  ActiveGenerationConflictError,
  ProjectGenerationStartCoordinator,
} from "../platform/projects/ProjectLifecycleCoordinator";
import { DurableStorageError } from "../platform/storage/StorageProvider";
import type { CreateBlueprintInput } from "../projects/types/blueprint";
import type { SaaSProject } from "../platform/projects/SaaSProjectRepository";

type StudioConnectionStatus =
  "connected" | "disconnected" | "syncing" | "error";

const BLUEPRINT_DIFFICULTIES = ["easy", "medium", "hard", "extreme"] as const;
type BlueprintDifficulty = (typeof BLUEPRINT_DIFFICULTIES)[number];

function isBlueprintDifficulty(value: unknown): value is BlueprintDifficulty {
  return BLUEPRINT_DIFFICULTIES.some((difficulty) => difficulty === value);
}

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

/**
 * The blueprint fields a project owns, and whether the user actually stated
 * each one.
 *
 * BLUEPRINT-STALE-001. Shared by blueprint creation and by the reconciliation
 * at generation start, so there is one definition of what the project states
 * rather than two that can drift.
 */
export function projectStatedIntent(project: SaaSProject): {
  stated: Partial<CreateBlueprintInput>;
  assumedFields: string[];
} {
  const stated: Partial<CreateBlueprintInput> = {};
  const assumedFields: string[] = [];

  const gameType = project.gameType?.trim();
  if (gameType) stated.game_type = gameType;
  else assumedFields.push("game_type");

  if (isBlueprintDifficulty(project.difficulty)) {
    stated.difficulty = project.difficulty;
  } else {
    assumedFields.push("difficulty");
  }

  if (
    project.players === "solo" ||
    project.players === "large-group" ||
    project.players === "mmo"
  ) {
    stated.estimated_players = project.players;
  } else {
    assumedFields.push("estimated_players");
  }

  if (project.genre) stated.genre = [project.genre];
  else assumedFields.push("genre");

  const description = (project.description ?? "").trim();
  if (description) stated.description = description;
  else assumedFields.push("description");

  const targetAudience = project.targetAudience?.trim();
  if (targetAudience) stated.target_audience = targetAudience;
  else assumedFields.push("target_audience");

  if (project.name) stated.name = project.name;

  return { stated, assumedFields };
}

/**
 * Preserve user-authored project intent when creating the first blueprint.
 *
 * INTENT-DEFAULT-CONTAMINATION-001. This function has to fill gaps, because the
 * blueprint contract requires a game type, a genre, a difficulty and a player
 * count. What it must not do is present those fills as things the user asked
 * for. Every gap it closes is named in `assumed_fields`, so a downstream reader
 * can tell a choice from a default.
 *
 * The invented description is gone. A project with no brief used to arrive
 * downstream carrying "Create a complete playable adventure Roblox experience",
 * which reads exactly like a user requirement and is not one. An empty
 * description is the honest representation of an empty brief, and the validator
 * does not require one.
 */
export function buildProjectBlueprintInput(
  project: SaaSProject,
): CreateBlueprintInput {
  const assumedFields: string[] = [];

  const statedGameType = project.gameType?.trim();
  const gameType = statedGameType || project.genre || "adventure";
  if (!statedGameType) assumedFields.push("game_type");

  const difficulty = isBlueprintDifficulty(project.difficulty)
    ? project.difficulty
    : "medium";
  if (!isBlueprintDifficulty(project.difficulty)) {
    assumedFields.push("difficulty");
  }

  const statedPlayers =
    project.players === "solo" ||
    project.players === "large-group" ||
    project.players === "mmo";
  const estimatedPlayers =
    project.players === "solo"
      ? "solo"
      : project.players === "large-group" || project.players === "mmo"
        ? project.players
        : "small-group";
  if (!statedPlayers) assumedFields.push("estimated_players");

  if (!project.genre) assumedFields.push("genre");

  const description = (project.description ?? "").trim();
  if (!description) assumedFields.push("description");

  const targetAudience = project.targetAudience?.trim();
  if (!targetAudience) assumedFields.push("target_audience");

  return {
    project_id: project.id,
    user_id: project.ownerId,
    name: project.name,
    description,
    assumed_fields: assumedFields,
    game_type: gameType,
    genre: [project.genre || gameType],
    target_audience: targetAudience || "general Roblox players",
    difficulty,
    estimated_players: estimatedPlayers,
    gameplay: {
      mechanics: [],
      progression: {},
      balance: {},
    },
    ui_layouts: [],
    architecture: {
      client_architecture: {},
      server_architecture: {},
      networking: {},
    },
    assets: { models: [], textures: [], sounds: [], animations: [] },
    code_spec: { modules: [], patterns: [] },
  };
}

export function createGameGenerationRouter(
  gameService: GameGenerationService,
  studioManager: StudioIntegrationManager,
  projectRuntime: ProjectRuntime,
): Router {
  const router = Router();
  // generationHistory is intentionally not destructured: the start-history
  // entry is now written inside the coordinator's durable batch rather than as
  // a separate follow-up write.
  const { projectRepository, access, storage } = projectRuntime;
  const generationStartCoordinator = new ProjectGenerationStartCoordinator(
    projectRepository,
    storage,
  );
  const generationOperatorUserIds = new Set(
    (process.env.GENERATION_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const requireGenerationOperator = async (
    req: Parameters<typeof access.requireAuthenticatedUser>[0],
    res: Parameters<typeof access.requireAuthenticatedUser>[1],
  ): Promise<boolean> => {
    if (process.env.NODE_ENV !== "production") return true;
    const userId = await access.requireAuthenticatedUser(req, res);
    if (!userId) return false;
    if (!generationOperatorUserIds.has(userId)) {
      res
        .status(403)
        .json({ success: false, error: "Generation operator access required" });
      return false;
    }
    return true;
  };

  /**
   * A refusal from the proposal review path is a client-side conflict, not a
   * server fault: the proposal is gone, or someone already decided it.
   */
  const sendProposalError = (
    res: Parameters<ProjectRuntime["access"]["requireProjectAccess"]>[1],
    error: unknown,
    fallback: string,
  ): void => {
    if (error instanceof BlueprintProposalError) {
      const missing = error.message.includes("not found");
      res
        .status(missing ? 404 : 409)
        .json({ success: false, error: error.message });
      return;
    }
    console.error(`[blueprint-proposals] ${fallback}:`, error);
    res.status(500).json({ success: false, error: fallback });
  };

  const sendStudioError = (
    res: Parameters<ProjectRuntime["access"]["requireProjectAccess"]>[1],
    error: unknown,
    fallback: string,
  ): void => {
    if (error instanceof DurableStorageError) {
      res.status(503).json({
        success: false,
        error: "Durable storage is temporarily unavailable",
      });
      return;
    }
    res.status(500).json({ success: false, error: fallback });
  };

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
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
      const userId = await access.getRequestUserId(req);
      if (!userId) return;
      const { blueprintId } = req.body;

      // SEC-GENERATION-BLUEPRINT-001. `blueprintId` is caller-supplied and was
      // previously resolved without proving it belongs to the project the
      // caller was authorized for, so authorization of one project could start
      // generation against another. An explicit id must resolve to a blueprint
      // owned by this project, and it never falls back to a different
      // blueprint: falling back would silently accept an unauthorized id.
      // 404 rather than 403 so the response does not confirm that a blueprint
      // exists in some other project, matching the execution-status endpoint.
      if (blueprintId) {
        const requested = await gameService.getBlueprint(blueprintId);
        if (!requested || requested.project_id !== projectId) {
          res.status(404).json({
            success: false,
            error: "Blueprint not found for this project",
          });
          return;
        }
      }

      // Auto-create a minimal blueprint if one doesn't exist yet.
      // This enables the workflow: Create Project → Generate without manual blueprint creation.
      const existingBlueprint =
        (await gameService.getBlueprint(blueprintId || projectId)) ??
        (await gameService.getBlueprintByProject(projectId));

      if (!existingBlueprint) {
        const project = projectRepository.get(projectId);
        if (!project) {
          res.status(404).json({ success: false, error: "Project not found" });
          return;
        }
        await gameService.createBlueprint(
          userId,
          projectId,
          buildProjectBlueprintInput(project),
        );
      } else {
        // BLUEPRINT-STALE-001. A blueprint was only ever built from the project
        // once. Editing the brief afterwards changed the project and left the
        // blueprint alone, so "create, generate, rewrite the brief, generate
        // again" silently regenerated the original design and the user saw no
        // reason why.
        //
        // Only fields the user actually stated are carried over. A value the
        // system assumed must not overwrite whatever the blueprint holds, since
        // that would let a default win against a deliberate refinement — the
        // same confusion INTENT-DEFAULT-CONTAMINATION-001 is about, pointed the
        // other way.
        const project = projectRepository.get(projectId);
        if (project) {
          const { stated, assumedFields } = projectStatedIntent(project);
          const drifted = Object.entries(stated).filter(([field, value]) => {
            const current = (
              existingBlueprint as unknown as Record<string, unknown>
            )[field];
            return JSON.stringify(current) !== JSON.stringify(value);
          });
          if (drifted.length > 0) {
            await gameService.updateBlueprint(existingBlueprint.id, {
              ...Object.fromEntries(drifted),
              assumed_fields: assumedFields,
            });
          }
        }
      }

      // AUDIT-START-ATOMICITY-001. The execution and its start-history entry
      // are handed to the coordinator as durable mutations so they commit in
      // the same transaction as the project's status/generationCount. The
      // pipeline is only enqueued after that transaction commits.
      const result = await generationStartCoordinator.start(
        projectId,
        // SEC-GENERATION-BLUEPRINT-001. projectId is passed as the expected
        // owner so the service refuses to build an execution for any other
        // project, even if the identifier resolves elsewhere. The route check
        // above and this are the same policy asserted at both boundaries, not
        // two policies. It now runs inside prepare, before anything durable
        // exists, so a refused request leaves no state at all.
        () =>
          gameService.prepareGeneration(
            blueprintId || projectId,
            userId,
            projectId,
          ),
        ({ execution, versionMutations }) => [
          // BLUEPRINT-STALE-001. The immutable snapshot this run is bound to
          // commits with the execution that names it, so neither can exist
          // without the other.
          ...versionMutations,
          {
            operation: "set" as const,
            collection: "generation_executions",
            id: execution.id,
            data: execution,
          },
          {
            operation: "set" as const,
            collection: "generation_history",
            id: execution.id,
            data: {
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
            },
          },
        ],
        ({ execution }) => execution.id,
        ({ execution, blueprint }) => {
          studioManager.activateProjectExecution(projectId, execution.id);
          gameService.enqueueGeneration(execution, blueprint, userId);
        },
      );
      res.json({
        success: true,
        executionId: result.execution.id,
        status: "generation_started",
      });
    } catch (error) {
      // AUDIT-DUP-GENERATION-001. A project that already has a running
      // generation is a conflict, not a server fault. Answering 500 here would
      // read as "try again", which is exactly how a retry produced the second
      // generation this refusal exists to prevent.
      if (error instanceof ActiveGenerationConflictError) {
        res.status(409).json({
          success: false,
          error: "A generation is already running for this project",
          executionId: error.activeExecutionId,
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : "Generation failed";
      console.error("[generate] Error:", message);
      res.status(500).json({ success: false, error: message });
    }
  });

  // ─── Blueprint change proposals (CHAT-BLUEPRINT-DISCONNECT-001) ────────
  //
  // A design change agreed in conversation used to affect nothing. These make
  // the claim reviewable: proposing records it, accepting applies it and
  // versions the result, and nothing takes effect until someone accepts.
  router.get("/:projectId/blueprint/proposals", async (req, res) => {
    const { projectId } = req.params;
    if (!(await access.requireProjectAccess(req, res, projectId))) return;
    try {
      const status = req.query.status;
      const proposals = await gameService.listBlueprintProposals(
        projectId,
        status === "pending" || status === "accepted" || status === "rejected"
          ? status
          : undefined,
      );
      res.json({ success: true, data: proposals });
    } catch (error) {
      sendProposalError(res, error, "Failed to list blueprint proposals");
    }
  });

  router.post("/:projectId/blueprint/proposals", async (req, res) => {
    const { projectId } = req.params;
    if (!(await access.requireProjectAccess(req, res, projectId))) return;
    const userId = await access.getRequestUserId(req);
    if (!userId) return;
    try {
      const blueprint = await gameService.getBlueprintByProject(projectId);
      if (!blueprint) {
        res.status(404).json({
          success: false,
          error: "Blueprint not found for this project",
        });
        return;
      }
      const { changes, rationale, proposedBy } = req.body ?? {};
      const proposal = await gameService.proposeBlueprintChange(
        blueprint.id,
        typeof proposedBy === "string" && proposedBy ? proposedBy : userId,
        (changes ?? {}) as Record<string, unknown>,
        typeof rationale === "string" ? rationale : undefined,
      );
      res.json({ success: true, data: proposal });
    } catch (error) {
      sendProposalError(res, error, "Failed to record blueprint proposal");
    }
  });

  router.post(
    "/:projectId/blueprint/proposals/:proposalId/accept",
    async (req, res) => {
      const { projectId, proposalId } = req.params;
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
      const userId = await access.getRequestUserId(req);
      if (!userId) return;
      try {
        const result = await gameService.acceptBlueprintProposal(
          proposalId,
          userId,
        );
        if (result.blueprint.project_id !== projectId) {
          res.status(404).json({ success: false, error: "Proposal not found" });
          return;
        }
        res.json({
          success: true,
          data: {
            blueprintId: result.blueprint.id,
            versionId: result.version.id,
            snapshotHash: result.version.snapshot_hash,
          },
        });
      } catch (error) {
        sendProposalError(res, error, "Failed to accept blueprint proposal");
      }
    },
  );

  router.post(
    "/:projectId/blueprint/proposals/:proposalId/reject",
    async (req, res) => {
      const { projectId, proposalId } = req.params;
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
      const userId = await access.getRequestUserId(req);
      if (!userId) return;
      try {
        const proposal = await gameService.rejectBlueprintProposal(
          proposalId,
          userId,
        );
        if (proposal.project_id !== projectId) {
          res.status(404).json({ success: false, error: "Proposal not found" });
          return;
        }
        res.json({ success: true, data: proposal });
      } catch (error) {
        sendProposalError(res, error, "Failed to reject blueprint proposal");
      }
    },
  );
  // Create blueprint
  router.post("/:projectId/blueprints", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
      const userId = await access.getRequestUserId(req);
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
      if (!(await access.requireProjectAccess(req, res, blueprint.project_id)))
        return;
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
      if (!(await access.requireProjectAccess(req, res, blueprint.project_id)))
        return;
      const validation = gameService.validateBlueprint(blueprint);
      res.json({ success: true, ...validation });
    } catch (error) {
      res.status(500).json({ success: false, error: "Validation failed" });
    }
  });

  // Get generation status
  router.get("/:projectId/generation/:executionId/status", async (req, res) => {
    try {
      if (!(await access.requireProjectAccess(req, res, req.params.projectId)))
        return;
      const execution = await gameService.getExecution(req.params.executionId);
      if (!execution) {
        res.status(404).json({ success: false, error: "Execution not found" });
        return;
      }
      if (execution.project_id !== req.params.projectId) {
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
      const blueprint = await gameService.getBlueprint(req.params.blueprintId);
      if (!blueprint) {
        res.status(404).json({ success: false, error: "Blueprint not found" });
        return;
      }
      if (!(await access.requireProjectAccess(req, res, blueprint.project_id)))
        return;
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
  router.get("/system/cache-stats", async (req, res) => {
    if (!(await requireGenerationOperator(req, res))) return;
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
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
      const studioId = req.query.studioId as string | undefined;
      const liveSession = findStudioSession(projectId, studioId);
      const session =
        liveSession ??
        (!studioId ? await studioManager.getProjectEvidence(projectId) : null);
      const pendingChanges = session
        ? liveSession
          ? studioManager.getPendingCommandCount(session.studioId)
          : session.verificationStatus === "queued"
            ? 1
            : 0
        : 0;

      const response: StudioConnectionInfo = {
        status: mapStudioStatus(liveSession),
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
      sendStudioError(res, error, "Failed to load Studio status");
    }
  });

  // Queue the latest canonical execution artifacts for Roblox Studio
  router.post("/:projectId/studio/sync", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
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

      const syncResult = await studioManager.synchronizeExecution(
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
      sendStudioError(res, error, "Studio synchronization failed");
    }
  });

  // Download a portable project manifest. The Roblox Studio bridge consumes
  // the same blueprint and execution metadata when a live Studio session is
  // available; this endpoint gives browser users a deterministic export.
  router.get("/:projectId/export", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
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
  router.get("/generation/stream", async (req, res) => {
    const projectId =
      typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
    if (!projectId) {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    if (!(await access.requireProjectAccess(req, res, projectId))) return;
    const clientId =
      typeof req.query.clientId === "string"
        ? req.query.clientId
        : `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    gameService.getStreamingHandler().registerClient(clientId, projectId, res);
  });

  return router;
}
