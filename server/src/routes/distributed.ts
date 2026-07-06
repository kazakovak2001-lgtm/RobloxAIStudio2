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

import { Router } from "express";
import { ExecutionCoordinator } from "../distributed/execution/ExecutionCoordinator";

export function createDistributedRouter(
  coordinator: ExecutionCoordinator,
): Router {
  const router = Router();

  // POST /submit — submit a new execution job
  router.post("/submit", (req, res) => {
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
  router.get("/job/:id", (req, res) => {
    const job = coordinator.getJobStatus(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, error: "Job not found" });
      return;
    }

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
  router.get("/cluster", (_req, res) => {
    const health = coordinator.getClusterHealth();
    res.json({ success: true, data: health });
  });

  // GET /queue — queue metrics
  router.get("/queue", (_req, res) => {
    const metrics = coordinator.getQueue().getMetrics();
    res.json({ success: true, data: metrics });
  });

  // GET /workers — worker list
  router.get("/workers", (_req, res) => {
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
  router.post("/scale", (req, res) => {
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
  router.get("/dead-letter", (_req, res) => {
    const entries = coordinator.getQueue().getDeadLetterQueue();
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
  router.post("/retry/:id", (req, res) => {
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
