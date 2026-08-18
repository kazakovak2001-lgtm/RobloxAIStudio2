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
import { registerPipelineEventBridge } from "./socket/pipelineEventBridge";
import { errorHandler } from "./common/middleware/errorHandler";
import { AgentRegistry } from "./agents/core/AgentRegistry";
import {
  LLMProviderFactory,
  describeAiMode,
  shouldRefuseStartupWithoutProvider,
} from "./providers/providerFactory";
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
  registerStoragePostInitializeHook,
} from "./platform/storage";
import {
  DatabaseHealthCheck,
  PostgresStorageProvider,
} from "./platform/storage/postgres";
import { runMigrations } from "./platform/storage/postgres/migrationRunner";
import { reconcileInterruptedGenerations } from "./platform/projects/GenerationRecovery";
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
io.use(async (socket, next) => {
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

  try {
    const session = await authService.validateToken(token as string);
    if (!session) {
      next(new Error("Invalid or expired token"));
      return;
    }

    // Attach authenticated user/session only after durable acknowledgement.
    (socket as any).data = {
      ...((socket as any).data || {}),
      user: session,
    };
    next();
  } catch {
    next(new Error("Authentication persistence unavailable"));
  }
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
  requireApiKeyCapability,
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
    ...describeAiMode(llmResult),
  });
});

// Initialize services
const events = new PipelineEventEmitter();
const streaming = new StreamingUpdateHandler();
const blueprintCache = new BlueprintCache();
const blueprintRepo = new InMemoryBlueprintRepository();

const pipelineIntegrator = null; // Deprecated: PlanExecutor is now the canonical runtime

// Resolve LLM provider from environment variables.
//
// REQUIRE_LLM_PROVIDER=true refuses to start whenever no provider resolved —
// both an unconstructable explicit DEFAULT_PROVIDER and a wholly empty
// configuration, since a release image that lost its provider settings would
// otherwise serve deterministic fallback content. It defaults to off so tests
// and local no-key development keep working; the release image is expected to
// set it.
const llmResult = LLMProviderFactory.create();
console.log(`[LLM] ${llmResult.info}`);

if (!llmResult.provider) {
  if (
    shouldRefuseStartupWithoutProvider(
      llmResult,
      process.env.REQUIRE_LLM_PROVIDER,
    )
  ) {
    console.error(
      `[LLM] REQUIRE_LLM_PROVIDER is set and no provider could be resolved — refusing to start. ${llmResult.info}`,
    );
    process.exit(1);
  }
  console.warn(
    "[LLM] Continuing without an LLM. Generated content will come from deterministic fallbacks and is recorded as such — it is not an AI generation.",
  );
}

const agentRegistry = new AgentRegistry(llmResult.provider ?? undefined);
const studioManager = new StudioIntegrationManager();

const gameService = new GameGenerationService(
  blueprintRepo,
  blueprintCache,
  streaming,
  events,
  pipelineIntegrator,
  agentRegistry,
  undefined,
  undefined,
  {
    provider: llmResult.provider ? llmResult.mode : null,
    ...(llmResult.model ? { model: llmResult.model } : {}),
  },
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
// Bridge pipeline lifecycle events to Socket.io for the existing Workspace UI.
registerPipelineEventBridge(io, events, projectRepository, generationHistory);

// API Routes
app.use("/api/projects", createProjectsRouter(projectRuntime));
app.use(
  "/api/projects",
  createGameGenerationRouter(gameService, studioManager, projectRuntime),
);
app.use("/api/evaluation", createEvaluationRouter(agentRegistry));
app.use("/api/memory", createMemoryRouter(access));
app.use("/api/plan", createPlanningRouter(agentRegistry, access));
app.use("/api/generate", createGenerationV2Router(agentRegistry, access));
app.use("/api/simulate", createSimulationRouter(access));
app.use("/api/economy", createEconomyRouter(access));
app.use("/api/world", createWorldRouter(access));
app.use("/api/lifecycle", createLifecycleRouter(access));
app.use("/api/compile", createCompileRouter(agentRegistry, access));
app.use("/api/debug", createDebugRouter());

// ─── Versioned API Gateway ──────────────────────────────────────────────────
const gateway = new ApiGateway({ version: "1.0.0" });
app.use("/api/v1", createV1Router(agentRegistry, gateway, access));
app.use("/api/v2", createV2Router(agentRegistry, gateway, access));

// ─── Distributed Execution Layer ────────────────────────────────────────────
const executionCoordinator = new ExecutionCoordinator(agentRegistry);
executionCoordinator.initialize();
app.use(
  "/api/distributed",
  createDistributedRouter(executionCoordinator, access),
);
app.use("/api/analytics", createAnalyticsRouter());

// System status API
import { createSystemRouter } from "./routes/system";
app.use("/api/system", createSystemRouter());

// Concept & Experience generation API
import { createConceptRouter } from "./routes/concept";
app.use(
  "/api/concept",
  createConceptRouter(agentRegistry, generationHistory, access),
);

// Studio Bridge API
import { createStudioRouter } from "./routes/studio";
app.use("/api/studio", createStudioRouter(undefined, access));

// AI Game Architect API
import { createGameArchitectRouter } from "./routes/gameArchitect";
app.use("/api/ai/game-architect", createGameArchitectRouter());

// Lua Generation API
import { createLuaGenerationRouter } from "./routes/luaGeneration";
app.use("/api/lua", createLuaGenerationRouter(access));

// Playtest API
import { createPlaytestRouter } from "./routes/playtest";
app.use("/api/playtest", createPlaytestRouter(access));

// Repair API
import { createRepairRouter } from "./routes/repair";
app.use(
  "/api/repair",
  createRepairRouter(access, agentRegistry, blueprintRepo, studioManager),
);

// Knowledge API
import { createKnowledgeRouter } from "./routes/knowledge";
app.use("/api/knowledge", createKnowledgeRouter(access));

// Agent Collaboration API
import { createAgentCollaborationRouter } from "./routes/agentCollaboration";
app.use("/api/agents", createAgentCollaborationRouter(access));

// Domain Intelligence API
import { createDomainRouter } from "./routes/domain";
app.use("/api/domain", createDomainRouter());

// Autonomous Orchestrator API
import { createAutonomousRouter } from "./routes/autonomous";
import { AutonomousOrchestrator } from "./orchestrator";
const autonomousOrchestrator = new AutonomousOrchestrator(events);
registerStoragePostInitializeHook(() => autonomousOrchestrator.ready());

// AUDIT-RECOVERY-001. Canonical generation gets the same treatment on boot:
// executions left `running` by a previous process are closed truthfully and
// their projects released, so nothing stays generating forever and the next
// generation can be admitted.
registerStoragePostInitializeHook(async () => {
  await reconcileInterruptedGenerations(storageProvider);
});
app.use(
  "/api/autonomous",
  createAutonomousRouter(events, access, autonomousOrchestrator),
);

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
app.get("/health/database", async (req, res) => {
  if (
    !requireApiKeyCapability(
      req,
      res,
      "system.health.database.read",
      "system-operational-metadata",
    )
  ) {
    return;
  }
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

app.get("/health/storage", (req, res) => {
  if (
    !requireApiKeyCapability(
      req,
      res,
      "system.health.storage.read",
      "system-operational-metadata",
    )
  ) {
    return;
  }
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
    ...describeAiMode(llmResult),
  });
});

// ─── Observability: Live execution trace streaming via Socket.io ────────────
const tracer = ExecutionTracer.instance();
// SEC-REALTIME-TRACE-001. Traces name the execution, the node, the agent, its
// evaluation score and its errors, so they are addressed to the room of the
// project the execution belongs to. An execution started without a project
// cannot be addressed to anyone entitled to it and is dropped rather than
// broadcast to every connected socket.
tracer.addListener((event) => {
  if (!event.projectId) {
    console.warn(
      `[trace] dropped trace.event with no project scope executionId=${event.executionId}`,
    );
    return;
  }
  io.to(`project:${event.projectId}`).emit("trace.event", {
    executionId: event.executionId,
    projectId: event.projectId,
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
  await getApiKeyStore().seedFromEnvironmentDurable();
  await getApiKeyStore().seedStudioFromEnvironmentDurable();
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

  // AUDIT-GRACEFUL-SHUTDOWN-001. The canonical generation queue is process
  // local, so anything still running is about to lose its worker. Closing the
  // HTTP server first means no new generation can be admitted; this then closes
  // what is left truthfully instead of leaving it durably `running` for the
  // next boot to find. It is the same reconciliation the next boot would run,
  // done now while the reason is known.
  try {
    await reconcileInterruptedGenerations(storageProvider);
  } catch (error) {
    console.error("[shutdown] generation reconciliation failed:", error);
  }

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
