/**
 * distributed.routes.ts
 *
 * API endpoints for the distributed execution layer.
 * Provides queue management, worker monitoring, and job submission.
 *
 * Endpoints:
 *   POST /api/distributed/submit    — submit execution job
 *   GET  /api/distributed/job/:id   — get job status
 *   GET  /api/distributed/cluster   — cluster health & scaling
 *   GET  /api/distributed/queue     — queue metrics
 *   GET  /api/distributed/workers   — worker list + metrics
 *   POST /api/distributed/scale     — manual scale request
 *   GET  /api/distributed/dead-letter — dead-letter queue
 *   POST /api/distributed/retry/:id — retry dead-letter job
 */

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { ExecutionCoordinator } from "../distributed/execution/ExecutionCoordinator";
import type { ConcealingProjectAccess } from "./projects";
import { createResourceAuthorizer } from "./resourceAuthorization";

function requireDistributedOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  const operatorIds = new Set(
    (process.env.DISTRIBUTED_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;
  if (!userId || !operatorIds.has(userId)) {
    res
      .status(403)
      .json({ success: false, error: "Distributed operator access required" });
    return;
  }
  next();
}

export function createDistributedRouter(
  coordinator: ExecutionCoordinator,
  access: ConcealingProjectAccess,
): Router {
  const router = Router();

  /**
   * MAR-001. This resolved correctly already — it loaded the job and authorized
   * the job's own project — but the two refusals differed. A job that did not
   * exist answered "Job not found"; another tenant's fell through to the
   * project control and answered "Project not found", so the pair told a caller
   * which job ids were real. That mattered most beside POST /retry, which
   * re-queues work and therefore spends compute.
   *
   * Through the canonical helper the project still comes from the loaded job,
   * and a job that is absent, unattributed or someone else's answers alike.
   */
  const requireOwned = createResourceAuthorizer(access.hasProjectAccess);
  const requireJobProjectAccess = (
    req: Request,
    res: Response,
    jobId: string,
  ) =>
    requireOwned(req, res, {
      resource: "Job",
      id: jobId,
      load: (id: string) => coordinator.getJobStatus(id),
      projectOf: (job) => job.projectId,
    });

  const filterAuthorizedDeadLetters = async (req: Request) => {
    const visible = [];
    for (const entry of coordinator.getQueue().getDeadLetterQueue()) {
      if (!entry.job.projectId) continue;
      if (
        access.hasProjectAccess &&
        (await access.hasProjectAccess(req, entry.job.projectId))
      ) {
        visible.push(entry);
      }
    }
    return visible;
  };

  // POST /submit — submit a new execution job
  router.post("/submit", async (req, res) => {
    try {
      const {
        intent,
        constraints,
        projectId,
        priority,
        maxAttempts,
        timeoutMs,
        metadata,
      } = req.body;

      if (!intent || typeof intent !== "string") {
        res.status(400).json({ success: false, error: "intent is required" });
        return;
      }
      if (!projectId || typeof projectId !== "string") {
        res
          .status(400)
          .json({ success: false, error: "projectId is required" });
        return;
      }
      if (!(await access.requireProjectAccess(req, res, projectId))) return;

      const job = coordinator.submit({
        intent,
        constraints,
        projectId,
        priority,
        maxAttempts,
        timeoutMs,
        metadata,
      });

      res.json({
        success: true,
        data: {
          jobId: job.jobId,
          executionId: job.executionId,
          status: job.status,
          priority: job.priority,
          createdAt: job.createdAt,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: "Job submission failed" });
    }
  });

  // GET /job/:id — get job status
  router.get("/job/:id", async (req, res) => {
    // The access check has already answered when it refuses. Writing a second
    // response here threw ERR_HTTP_HEADERS_SENT on every denied request, which
    // surfaced as an unhandled error rather than as the refusal it was.
    const job = await requireJobProjectAccess(req, res, req.params.id);
    if (!job) return;

    res.json({
      success: true,
      data: {
        jobId: job.jobId,
        executionId: job.executionId,
        status: job.status,
        intent: job.intent,
        priority: job.priority,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        assignedWorker: job.assignedWorker,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        error: job.error,
        hasResult: job.result !== undefined,
      },
    });
  });

  // GET /cluster — cluster health
  router.get("/cluster", requireDistributedOperator, (_req, res) => {
    const health = coordinator.getClusterHealth();
    res.json({ success: true, data: health });
  });

  // GET /queue — queue metrics
  router.get("/queue", requireDistributedOperator, (_req, res) => {
    const metrics = coordinator.getQueue().getMetrics();
    res.json({ success: true, data: metrics });
  });

  // GET /workers — worker list
  router.get("/workers", requireDistributedOperator, (_req, res) => {
    const health = coordinator.getClusterHealth();
    res.json({
      success: true,
      data: {
        count: health.totalWorkers,
        workers: health.workerMetrics,
      },
    });
  });

  // POST /scale — manual scaling
  router.post("/scale", requireDistributedOperator, (req, res) => {
    const { action, count } = req.body;

    if (action === "up") {
      const n = Math.min(count ?? 1, 4);
      for (let i = 0; i < n; i++) {
        coordinator.addWorker();
      }
      res.json({
        success: true,
        data: { action: "scaled-up", added: n, total: coordinator.workerCount },
      });
    } else if (action === "down") {
      const health = coordinator.getClusterHealth();
      const idle = health.workerMetrics.filter((w) => w.state === "idle");
      const n = Math.min(count ?? 1, idle.length);
      for (let i = 0; i < n; i++) {
        coordinator.removeWorker(idle[i].workerId);
      }
      res.json({
        success: true,
        data: {
          action: "scaled-down",
          removed: n,
          total: coordinator.workerCount,
        },
      });
    } else {
      res
        .status(400)
        .json({ success: false, error: "action must be 'up' or 'down'" });
    }
  });

  // GET /dead-letter — dead letter queue
  router.get("/dead-letter", async (req, res) => {
    const entries = await filterAuthorizedDeadLetters(req);
    res.json({
      success: true,
      data: {
        count: entries.length,
        entries: entries.map((e) => ({
          jobId: e.job.jobId,
          intent: e.job.intent,
          reason: e.reason,
          deadAt: e.deadAt,
          attempts: e.job.attempts,
        })),
      },
    });
  });

  // POST /retry/:id — retry a dead-letter job
  router.post("/retry/:id", async (req, res) => {
    const job = await requireJobProjectAccess(req, res, req.params.id);
    if (!job) return;
    const success = coordinator.getQueue().retryDeadLetter(req.params.id);
    if (!success) {
      res
        .status(404)
        .json({ success: false, error: "Job not found in dead-letter queue" });
      return;
    }
    res.json({
      success: true,
      data: { jobId: req.params.id, status: "re-queued" },
    });
  });

  return router;
}
