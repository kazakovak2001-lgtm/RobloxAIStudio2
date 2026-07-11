import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { createProjectsRouter } from "./routes/projects";
import { createGameGenerationRouter } from "./routes/game-generation";
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
import { LLMProviderFactory } from "./ai/providerFactory";
import { ExecutionTracer } from "./core/observability/ExecutionTracer";
import { StudioIntegrationManager } from "./studio/integration/StudioIntegrationManager";
const app: Express = express();

const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  next();
});

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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

// Real-time socket namespace and project room support
new RealtimeServer(io);

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
      };
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
        error: evt.data?.error,
        stepId: evt.data?.stepId ?? evt.data?.failedStepId,
        agentId: evt.data?.agentId ?? evt.data?.failedAgentId,
        stage: evt.data?.stage,
        failedReason: evt.data?.failedReason,
        failedSteps: evt.data?.failedSteps,
        completedSteps: evt.data?.completedSteps,
      };
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
      io.emit(evt.type, { pipelineId: evt.pipelineId, ...evt.data });
      break;
    }
    default:
      break;
  }
});

// API Routes
app.use("/api/projects", createProjectsRouter());
app.use(
  "/api/projects",
  createGameGenerationRouter(gameService, studioManager),
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
app.use("/api/concept", createConceptRouter(agentRegistry));

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

startServer(PORT);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n📴 SIGTERM received, shutting down gracefully...");
  executionCoordinator.shutdown();
  httpServer.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n📴 SIGINT received, shutting down gracefully...");
  executionCoordinator.shutdown();
  httpServer.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

export { app, httpServer, io };
