import express, { type Express, type Request, type Response } from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { createProjectsRouter, createProjectRuntime } from "./routes/projects";
import { createGameGenerationRouter } from "./routes/game-generation";
import { createChatPersistenceRouter } from "./routes/chatPersistence";
import { createEvaluationRouter } from "./routes/evaluation";
import { createMemoryRouter } from "./routes/memory";
import { createPlanningRouter } from "./routes/planning";
import { createGenerationV2Router } from "./routes/generation-v2";
import { createSimulationRouter } from "./routes/simulation";
import { createEconomyRouter } from "./routes/economy";
import { createWorldRouter } from "./routes/world";
import { createLifecycleRouter } from "./routes/lifecycle";
import { createCompileRouter } from "./routes/compile";
import { createDebugRouter } from "./routes/debug";
import { ApiGateway } from "./api/gateway/ApiGateway";
import { createV1Router } from "./api/v1";
import { createV2Router } from "./api/v2";
import { createDistributedRouter } from "./routes/distributed";
import { createAnalyticsRouter } from "./routes/analytics";
import { ExecutionCoordinator } from "./distributed/execution/ExecutionCoordinator";
import { GameGenerationService } from "./projects/services/game-generation.service";

import { InMemoryBlueprintRepository } from "./projects/repository/blueprint.repository";
import { BlueprintCache } from "./projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "./socket/streaming";
import { RealtimeServer } from "./socket/index";
import { errorHandler } from "./common/middleware/errorHandler";
import { AgentRegistry } from "./agents/core/AgentRegistry";
import { LLMProviderFactory } from "./providers/providerFactory";
import { ExecutionTracer } from "./core/observability/ExecutionTracer";
import { StudioIntegrationManager } from "./studio/integration/StudioIntegrationManager";
import {
  authService,
  configureAuthService,
} from "./platform/auth/authServiceInstance";
import {
  closeStorageProvider,
  createStorageProvider,
  flushStorageProvider,
  getStorageType,
  initializeStorageProvider,
} from "./platform/storage";
import {
  DatabaseHealthCheck,
  PostgresStorageProvider,
} from "./platform/storage/postgres";
import { runMigrations } from "./platform/storage/postgres/migrationRunner";
const app: Express = express();
const storageProvider = createStorageProvider();
configureAuthService(storageProvider);
const projectRuntime = createProjectRuntime(storageProvider, authService);
const { projectRepository, generationHistory, access } = projectRuntime;

const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? getAllowedFrontendOrigins()
        : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  },
});

function readSocketCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

// Socket.IO authentication middleware
io.use((socket, next) => {
  // In development, allow all connections (preserve dev bypass)
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  // Browser clients authenticate with the same httpOnly cookie as HTTP.
  // Explicit auth/query tokens remain supported for CLI and Studio clients.
  const token =
    socket.handshake.auth?.token ??
    socket.handshake.query?.token ??
    readSocketCookie(socket.handshake.headers.cookie, "roblox_ai_token");

  if (!token) {
    next(new Error("Authentication required"));
    return;
  }

  // Validate token using AuthService (same validation as HTTP middleware)
  const session = authService.validateToken(token as string);
  if (!session) {
    next(new Error("Invalid or expired token"));
    return;
  }

  // Attach authenticated user/session to socket.data
  (socket as any).data = { ...((socket as any).data || {}), user: session };
  next();
});

// Middleware
import cookieParser from "cookie-parser";
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Security middleware
import {
  rateLimiter,
  securityHeaders,
  corsMiddleware,
  authMiddleware,
  configureApiKeyStore,
  getAllowedFrontendOrigins,
  getApiKeyStore,
  requestLogger,
} from "./common/middleware/security";

configureApiKeyStore(storageProvider);
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(rateLimiter);
app.use(requestLogger);
app.use(authMiddleware);
app.use((req, res, next) => {
  const userId = (req as unknown as { user?: { userId?: string } }).user
    ?.userId;
  if (!userId) {
    next();
    return;
  }

  const body = req.body as
    | {
        projectId?: unknown;
        gameId?: unknown;
        blueprint?: { id?: unknown };
      }
    | undefined;
  const candidates = [
    body?.projectId,
    body?.gameId,
    body?.blueprint?.id,
    req.query.projectId,
  ].filter((value): value is string => typeof value === "string");

  const denied = candidates.some(
    (projectId) =>
      projectRepository.get(projectId) !== null &&
      !projectRepository.verifyOwnership(projectId, userId),
  );
  if (denied) {
    res.status(403).json({ success: false, error: "Project access denied" });
    return;
  }
  next();
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    llm: llmResult.mode === "none" ? "stub" : llmResult.mode,
  });
});

// Initialize services
const events = new PipelineEventEmitter();
const streaming = new StreamingUpdateHandler();
const blueprintCache = new BlueprintCache();
const blueprintRepo = new InMemoryBlueprintRepository();

const pipelineIntegrator = null; // Deprecated: PlanExecutor is now the canonical runtime

// Resolve LLM provider from environment variables
const llmResult = LLMProviderFactory.create();
console.log(`[LLM] ${llmResult.info}`);

const agentRegistry = new AgentRegistry(llmResult.provider ?? undefined);
const studioManager = new StudioIntegrationManager();

const gameService = new GameGenerationService(
  blueprintRepo,
  blueprintCache,
  streaming,
  events,
  pipelineIntegrator,
  agentRegistry,
);

// Connect event emitter to streaming handler
events.setStreamingHandler(streaming);

// Real-time socket namespace and project room support. Authenticated browser
// sessions may only join projects they own; development and trusted API-key
// clients do not carry a userId and keep the compatibility path.
new RealtimeServer(io, (projectId, userId) =>
  userId ? projectRepository.verifyOwnership(projectId, userId) : true,
);

// Bridge pipeline lifecycle events to Socket.io so the existing Workspace UI (Socket.io-based) receives them.
// This is a thin adapter only; it preserves the existing socket event names.
events.onEvent(async (evt) => {
  // Minimal bridge logging for E2E verification.
  console.log(
    `[pipeline-bridge] emitted ${evt.type} pipelineId=${evt.pipelineId} stepId=${evt.stepId ?? "-"}`,
  );

  const emitForProject = (
    eventName: string,
    payload: Record<string, unknown>,
  ) => {
    if (evt.projectId) {
      io.to(`project:${evt.projectId}`).emit(eventName, payload);
    } else {
      io.emit(eventName, payload);
    }
  };

  switch (evt.type) {
    case "pipeline.started": {
      const payload = {
        pipelineId: evt.pipelineId,
        projectId: evt.projectId,
        startedAt: evt.timestamp.toISOString(),
      };
      console.log("[pipeline-bridge] forwarding", "pipeline.started", payload);
      emitForProject("pipeline.started", payload);
      break;
    }
    case "step.started": {
      const payload = {
        pipelineId: evt.pipelineId,
        projectId: evt.projectId,
        stepId: evt.stepId,
        agentId: evt.data?.name,
        status: "started",
        progress: 0,
        timestamp: evt.timestamp.toISOString(),
      };
      console.log("[pipeline-bridge] forwarding", "step.started", payload);
      emitForProject("step.started", payload);
      break;
    }
    case "step.completed": {
      const payload = {
        pipelineId: evt.pipelineId,
        projectId: evt.projectId,
        stepId: evt.stepId,
        agentId: evt.data?.name,
        status: "completed",
        progress: 100,
        timestamp: evt.timestamp.toISOString(),
        output: evt.data?.output,
      };
      console.log("[pipeline-bridge] forwarding", "step.completed", payload);
      emitForProject("step.completed", payload);
      break;
    }
    case "step.failed": {
      const payload = {
        pipelineId: evt.pipelineId,
        projectId: evt.projectId,
        stepId: evt.stepId,
        agentId: evt.data?.name,
        status: "failed",
        progress: 0,
        timestamp: evt.timestamp.toISOString(),
        error: evt.data?.error,
      };
      console.log("[pipeline-bridge] forwarding", "step.failed", payload);
      emitForProject("step.failed", payload);
      break;
    }
    case "pipeline.completed": {
      const payload = {
        pipelineId: evt.pipelineId,
        projectId: evt.projectId,
        outputs: evt.data?.outputs,
        timestamp: evt.timestamp.toISOString(),
      };
      if (evt.projectId) {
        await projectRepository.updateDurable(evt.projectId, {
          status: "ready",
          qualityScore: 100,
        });
        const record = generationHistory.getByPipeline(evt.pipelineId);
        if (record) {
          const finishedAt = evt.timestamp.getTime();
          const completed = Number(
            evt.data?.completedSteps ?? record.stagesCompleted,
          );
          const failed = Number(evt.data?.failedSteps ?? record.failures);
          generationHistory.record({
            ...record,
            status: "completed",
            finishedAt,
            duration: finishedAt - record.startedAt,
            stagesCompleted: completed,
            stagesTotal: Math.max(record.stagesTotal, completed + failed),
            failures: failed,
          });
        }
      }
      console.log(
        "[pipeline-bridge] forwarding",
        "pipeline.completed",
        payload,
      );
      emitForProject("pipeline.completed", payload);
      break;
    }
    case "pipeline.failed": {
      const payload = {
        pipelineId: evt.pipelineId,
        projectId: evt.projectId,
        timestamp: evt.timestamp.toISOString(),
        error: evt.data?.error,
        stepId: evt.data?.stepId ?? evt.data?.failedStepId,
        agentId: evt.data?.agentId ?? evt.data?.failedAgentId,
        stage: evt.data?.stage,
        failedReason: evt.data?.failedReason,
        failedSteps: evt.data?.failedSteps,
        completedSteps: evt.data?.completedSteps,
      };
      if (evt.projectId) {
        await projectRepository.updateDurable(evt.projectId, {
          status: "draft",
        });
        const record = generationHistory.getByPipeline(evt.pipelineId);
        if (record) {
          const finishedAt = evt.timestamp.getTime();
          const completed = Number(
            evt.data?.completedSteps ?? record.stagesCompleted,
          );
          const failed = Number(
            evt.data?.failedSteps ?? (record.failures || 1),
          );
          generationHistory.record({
            ...record,
            status: "failed",
            finishedAt,
            duration: finishedAt - record.startedAt,
            stagesCompleted: completed,
            stagesTotal: Math.max(record.stagesTotal, completed + failed),
            failures: failed,
          });
        }
      }
      console.log("[pipeline-bridge] forwarding", "pipeline.failed", payload);
      emitForProject("pipeline.failed", payload);
      break;
    }
    case "evaluation.started": {
      io.emit("evaluation.started", {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        agentType: evt.data?.agentType,
        timestamp: evt.timestamp,
      });
      break;
    }
    case "evaluation.completed": {
      io.emit("evaluation.completed", {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        qualityScore: evt.data?.qualityScore,
        status: evt.data?.status,
        issueCount: evt.data?.issueCount,
        durationMs: evt.data?.durationMs,
        recommendations: evt.data?.recommendations,
      });
      break;
    }
    case "evaluation.failed": {
      io.emit("evaluation.failed", {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        qualityScore: evt.data?.qualityScore,
        issues: evt.data?.issues,
      });
      break;
    }
    case "memory.created": {
      io.emit("memory.created", {
        pipelineId: evt.pipelineId,
        executionId: evt.data?.executionId,
        blueprintId: evt.data?.blueprintId,
      });
      break;
    }
    case "memory.updated": {
      io.emit("memory.updated", {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        agent: evt.data?.agent,
        section: evt.data?.section,
      });
      break;
    }
    case "memory.snapshot": {
      io.emit("memory.snapshot", {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        snapshotId: evt.data?.snapshotId,
        snapshotNumber: evt.data?.snapshotNumber,
      });
      break;
    }
    case "memory.decision": {
      io.emit("memory.decision", {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        category: evt.data?.category,
        summary: evt.data?.summary,
        agent: evt.data?.agent,
      });
      break;
    }
    case "planning.created": {
      io.emit("planning.created", {
        pipelineId: evt.pipelineId,
        planId: evt.data?.planId,
        steps: evt.data?.steps,
      });
      break;
    }
    case "planning.updated": {
      io.emit("planning.updated", {
        pipelineId: evt.pipelineId,
        completed: evt.data?.completed,
        remaining: evt.data?.remaining,
      });
      break;
    }
    case "planning.step.selected": {
      io.emit("planning.step.selected", {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        agent: evt.data?.agent,
        priority: evt.data?.priority,
      });
      break;
    }
    case "planning.replanned": {
      io.emit("planning.replanned", {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        reason: evt.data?.reason,
        preserved: evt.data?.preserved,
        remaining: evt.data?.remaining,
      });
      break;
    }
    case "planning.completed": {
      io.emit("planning.completed", {
        pipelineId: evt.pipelineId,
        planId: evt.data?.planId,
        metrics: evt.data?.metrics,
      });
      break;
    }
    case "planning.failed": {
      io.emit("planning.failed", {
        pipelineId: evt.pipelineId,
        error: evt.data?.error,
      });
      break;
    }
    case "generation.started":
    case "generation.blueprint.updated":
    case "generation.validation.completed":
    case "generation.report.created":
    case "generation.completed":
    case "generation.failed":
    case "assembly.started":
    case "assembly.workspace.created":
    case "assembly.mapping.completed":
    case "assembly.validation.completed":
    case "assembly.completed":
    case "assembly.failed":
    case "assembly.replay.completed":
    case "assembly.diff.completed":
    case "assembly.impact.analyzed":
    case "assembly.governance.decision":
    case "assembly.ci.blocked":
    case "assembly.ci.passed":
    case "compiler.build.started":
    case "compiler.build.completed":
    case "compiler.build.failed":
    case "compiler.stage.error":
    case "compiler.governance.decision":
    case "project.created":
    case "project.deleted":
    case "project.context.initialized":
    case "distributed.job.queued":
    case "distributed.job.started":
    case "distributed.job.completed":
    case "distributed.job.failed":
    case "distributed.worker.registered":
    case "distributed.worker.stopped":
    case "cloud.node.registered":
    case "cloud.node.unregistered":
    case "cloud.node.heartbeat":
    case "cloud.job.routed":
    case "cloud.node.failed":
    case "cluster.topology.updated":
    case "studio.connected":
    case "studio.disconnected":
    case "studio.sync.update":
    case "studio.asset.changed":
    case "studio.scene.updated":
    case "studio.import.completed":
    case "agent.task.created":
    case "agent.task.completed":
    case "agent.decision.made":
    case "agent.conflict.detected":
    case "agent.conflict.resolved": {
      emitForProject(evt.type, {
        pipelineId: evt.pipelineId,
        projectId: evt.projectId,
        timestamp: evt.timestamp.toISOString(),
        ...evt.data,
      });
      break;
    }
    default:
      break;
  }
});

// API Routes
app.use("/api/projects", createProjectsRouter(projectRuntime));
app.use(
  "/api/projects",
  createGameGenerationRouter(gameService, studioManager, projectRuntime),
);
app.use("/api/evaluation", createEvaluationRouter(agentRegistry));
app.use("/api/memory", createMemoryRouter());
app.use("/api/plan", createPlanningRouter(agentRegistry));
app.use("/api/generate", createGenerationV2Router(agentRegistry));
app.use("/api/simulate", createSimulationRouter());
app.use("/api/economy", createEconomyRouter());
app.use("/api/world", createWorldRouter());
app.use("/api/lifecycle", createLifecycleRouter());
app.use("/api/compile", createCompileRouter(agentRegistry));
app.use("/api/debug", createDebugRouter());

// ─── Versioned API Gateway ──────────────────────────────────────────────────
const gateway = new ApiGateway({ version: "1.0.0" });
app.use("/api/v1", createV1Router(agentRegistry, gateway));
app.use("/api/v2", createV2Router(agentRegistry, gateway));

// ─── Distributed Execution Layer ────────────────────────────────────────────
const executionCoordinator = new ExecutionCoordinator(agentRegistry);
executionCoordinator.initialize();
app.use("/api/distributed", createDistributedRouter(executionCoordinator));
app.use("/api/analytics", createAnalyticsRouter());

// System status API
import { createSystemRouter } from "./routes/system";
app.use("/api/system", createSystemRouter());

// Concept & Experience generation API
import { createConceptRouter } from "./routes/concept";
app.use("/api/concept", createConceptRouter(agentRegistry, generationHistory));

// Studio Bridge API
import { createStudioRouter } from "./routes/studio";
app.use("/api/studio", createStudioRouter());

// AI Game Architect API
import { createGameArchitectRouter } from "./routes/gameArchitect";
app.use("/api/ai/game-architect", createGameArchitectRouter());

// Lua Generation API
import { createLuaGenerationRouter } from "./routes/luaGeneration";
app.use("/api/lua", createLuaGenerationRouter());

// Playtest API
import { createPlaytestRouter } from "./routes/playtest";
app.use("/api/playtest", createPlaytestRouter());

// Repair API
import { createRepairRouter } from "./routes/repair";
app.use("/api/repair", createRepairRouter());

// Knowledge API
import { createKnowledgeRouter } from "./routes/knowledge";
app.use("/api/knowledge", createKnowledgeRouter());

// Agent Collaboration API
import { createAgentCollaborationRouter } from "./routes/agentCollaboration";
app.use("/api/agents", createAgentCollaborationRouter());

// Domain Intelligence API
import { createDomainRouter } from "./routes/domain";
app.use("/api/domain", createDomainRouter());

// Autonomous Orchestrator API
import { createAutonomousRouter } from "./routes/autonomous";
app.use("/api/autonomous", createAutonomousRouter(events));

// AI Project Controller API
import { createControllerRouter } from "./routes/controller";
app.use("/api/controller", createControllerRouter(agentRegistry));

// AI Conversational Chat API
import { createAiChatRouter } from "./routes/aiChat";
app.use("/api/ai", createAiChatRouter(llmResult.provider, agentRegistry));
app.use("/api/chat", createChatPersistenceRouter(access));

// Platform API (users, versions, registry)
import { createPlatformRouter } from "./routes/platform";
app.use(
  "/api/platform",
  createPlatformRouter({ storage: storageProvider, access }),
);

// Database health endpoints
app.get("/health/database", async (_req, res) => {
  if (!(storageProvider instanceof PostgresStorageProvider)) {
    res.json({
      success: true,
      data: { status: "not_configured", connected: false, mode: "inmemory" },
    });
    return;
  }
  const status = await new DatabaseHealthCheck(storageProvider).check();
  res.json({ success: true, data: status });
});

app.get("/health/storage", (_req, res) => {
  const operational = storageProvider.getOperationalStatus();
  res.json({
    success: true,
    data: {
      provider: getStorageType(),
      status: operational.availability,
      durability: operational.durability,
      pendingMutations: operational.pendingMutations,
      ...(operational.lastFailureAt
        ? { lastFailureAt: operational.lastFailureAt }
        : {}),
    },
  });
});

// Root endpoint
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "Roblox AI Studio - Game Generation Engine",
    version: "1.0.0",
    status: "running",
    llm: llmResult.mode === "none" ? "stub" : llmResult.mode,
  });
});

// ─── Observability: Live execution trace streaming via Socket.io ────────────
const tracer = ExecutionTracer.instance();
tracer.addListener((event) => {
  io.emit("trace.event", {
    executionId: event.executionId,
    nodeId: event.nodeId,
    agentId: event.agentId,
    eventType: event.eventType,
    timestamp: event.timestamp,
    durationMs: event.durationMs,
    evaluationScore: event.evaluationScore,
    error: event.error,
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    path: req.path,
  });
});

// Start server
let PORT = parseInt(process.env.PORT || "5000", 10);

const startServer = (port: number) => {
  httpServer.listen(port, "0.0.0.0", () => {
    PORT = port;
    console.log(`\n🚀 Roblox AI Studio - Game Generation Engine`);
    console.log(`📡 Server running on http://0.0.0.0:${port}`);
    console.log(`🔌 WebSocket connected via Socket.io`);
    console.log(`✅ Ready for incoming game generation requests\n`);
  });
};

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    const fallbackPort = PORT + 1;
    console.warn(
      `⚠️ Port ${PORT} is already in use. Attempting fallback port ${fallbackPort}...`,
    );
    PORT = fallbackPort;
    startServer(fallbackPort);
    return;
  }

  console.error("Fatal server error:", error);
  process.exit(1);
});

async function bootstrap(): Promise<void> {
  // Migrations own the durable schema. The cache is loaded only after they
  // succeed, so no route can observe an empty PostgreSQL cache at startup.
  await runMigrations();
  await initializeStorageProvider(storageProvider);
  const migratedRefreshCredentials =
    authService.migrateLegacyRefreshCredentials();
  if (migratedRefreshCredentials > 0) {
    await flushStorageProvider(storageProvider);
    console.log(
      `[auth] Migrated ${migratedRefreshCredentials} legacy refresh credential(s) to digests`,
    );
  }
  await getApiKeyStore().seedFromEnvironmentDurable();
  startServer(PORT);
}

let shuttingDown = false;

async function shutdown(signal: "SIGTERM" | "SIGINT"): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n📴 ${signal} received, shutting down gracefully...`);
  executionCoordinator.shutdown();
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
  await flushStorageProvider(storageProvider);
  await closeStorageProvider(storageProvider);
  console.log("✅ Server closed");
  process.exit(0);
}

void bootstrap().catch(async (error) => {
  console.error("[startup] Durable storage bootstrap failed:", error);
  await closeStorageProvider(storageProvider).catch(() => undefined);
  process.exit(1);
});

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

export { app, httpServer, io };
