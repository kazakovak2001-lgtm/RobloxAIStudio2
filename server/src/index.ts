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
import { GameGenerationService } from "./projects/services/game-generation.service";

import { InMemoryBlueprintRepository } from "./projects/repository/blueprint.repository";
import { BlueprintCache } from "./projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "./socket/streaming";
import { errorHandler } from "./common/middleware/errorHandler";
import { AIPipelineIntegrator } from "./execution/aiPipelineIntegrator";
import { AgentRegistry } from "./agents/core/AgentRegistry";
import { LLMProviderFactory } from "./ai/providerFactory";

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

const pipelineIntegrator = new AIPipelineIntegrator(events);

// Resolve LLM provider from environment variables
const llmResult = LLMProviderFactory.create();
console.log(`[LLM] ${llmResult.info}`);

const agentRegistry = new AgentRegistry(llmResult.provider ?? undefined);

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

// Bridge pipeline lifecycle events to Socket.io so the existing Workspace UI (Socket.io-based) receives them.
// This is a thin adapter only; it preserves the existing socket event names.
events.onEvent(async (evt) => {
  // Minimal bridge logging for E2E verification.
  console.log(
    `[pipeline-bridge] emitted ${evt.type} pipelineId=${evt.pipelineId} stepId=${evt.stepId ?? "-"}`,
  );

  switch (evt.type) {
    case "pipeline.started": {
      const payload = {
        pipelineId: evt.pipelineId,
        startedAt: evt.timestamp,
      };
      console.log("[pipeline-bridge] forwarding", "pipeline.started", payload);
      io.emit("pipeline.started", payload);
      break;
    }
    case "step.started": {
      const payload = {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        agentId: evt.data?.name,
        startedAt: evt.timestamp,
      };
      console.log("[pipeline-bridge] forwarding", "step.started", payload);
      io.emit("step.started", payload);
      break;
    }
    case "step.completed": {
      const payload = {
        pipelineId: evt.pipelineId,
        stepId: evt.stepId,
        agentId: evt.data?.name,
        finishedAt: evt.timestamp,
        output: evt.data?.output,
      };
      console.log("[pipeline-bridge] forwarding", "step.completed", payload);
      io.emit("step.completed", payload);
      break;
    }
    case "pipeline.completed": {
      const payload = {
        pipelineId: evt.pipelineId,
        outputs: evt.data?.outputs,
      };
      console.log(
        "[pipeline-bridge] forwarding",
        "pipeline.completed",
        payload,
      );
      io.emit("pipeline.completed", payload);
      break;
    }
    case "pipeline.failed": {
      const payload = {
        pipelineId: evt.pipelineId,
        error: evt.data?.error,
      };
      console.log("[pipeline-bridge] forwarding", "pipeline.failed", payload);
      io.emit("pipeline.failed", payload);
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
    case "compiler.governance.decision": {
      io.emit(evt.type, { pipelineId: evt.pipelineId, ...evt.data });
      break;
    }
    default:
      break;
  }
});

// API Routes
app.use("/api/projects", createProjectsRouter());
app.use("/api/projects", createGameGenerationRouter(gameService));

// Root endpoint
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "Roblox AI Studio - Game Generation Engine",
    version: "1.0.0",
    status: "running",
    llm: llmResult.mode === "none" ? "stub" : llmResult.mode,
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
const PORT = parseInt(process.env.PORT || "5000", 10);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Roblox AI Studio - Game Generation Engine`);
  console.log(`📡 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🔌 WebSocket connected via Socket.io`);
  console.log(`✅ Ready for incoming game generation requests\n`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n📴 SIGTERM received, shutting down gracefully...");
  httpServer.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n📴 SIGINT received, shutting down gracefully...");
  httpServer.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

export { app, httpServer, io };
