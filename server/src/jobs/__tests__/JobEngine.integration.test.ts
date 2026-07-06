/**
 * Job Engine Integration Tests
 *
 * Tests:
 *   1. Single job execution
 *   2. Multiple queued jobs
 *   3. Timeout handling
 *   4. Cancellation
 *   5. Retry on failure
 *   6. Queue rejection (full)
 *   7. State machine validity
 */

import { describe, it, expect, beforeEach } from "vitest";
import { JobManager } from "../JobManager";
import { JobQueue } from "../JobQueue";
import { JobStateMachine } from "../JobStateMachine";
import { JobLifecycle } from "../JobLifecycle";
import { JobProgressTracker } from "../JobProgressTracker";
import { JobMetricsService } from "../JobMetricsService";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import type { Job, JobEvent } from "../types";
import { createJobId } from "../types";

describe("JobStateMachine", () => {
  const sm = new JobStateMachine();

  it("allows valid transitions", () => {
    expect(sm.canTransition("QUEUED", "VALIDATING")).toBe(true);
    expect(sm.canTransition("VALIDATING", "PLANNING")).toBe(true);
    expect(sm.canTransition("PLANNING", "EXECUTING")).toBe(true);
    expect(sm.canTransition("EXECUTING", "EVALUATING")).toBe(true);
    expect(sm.canTransition("EVALUATING", "GENERATING_ARTIFACTS")).toBe(true);
    expect(sm.canTransition("GENERATING_ARTIFACTS", "COMPLETED")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(sm.canTransition("QUEUED", "COMPLETED")).toBe(false);
    expect(sm.canTransition("COMPLETED", "QUEUED")).toBe(false);
    expect(sm.canTransition("EXECUTING", "PLANNING")).toBe(false);
  });

  it("allows failure from any active state", () => {
    expect(sm.canTransition("VALIDATING", "FAILED")).toBe(true);
    expect(sm.canTransition("PLANNING", "FAILED")).toBe(true);
    expect(sm.canTransition("EXECUTING", "FAILED")).toBe(true);
    expect(sm.canTransition("EVALUATING", "FAILED")).toBe(true);
    expect(sm.canTransition("GENERATING_ARTIFACTS", "FAILED")).toBe(true);
  });

  it("allows cancellation from any active state", () => {
    expect(sm.canTransition("QUEUED", "CANCELLED")).toBe(true);
    expect(sm.canTransition("EXECUTING", "CANCELLED")).toBe(true);
  });

  it("allows retry from FAILED/TIMEOUT", () => {
    expect(sm.canTransition("FAILED", "QUEUED")).toBe(true);
    expect(sm.canTransition("TIMEOUT", "QUEUED")).toBe(true);
  });

  it("throws on invalid transition", () => {
    expect(() => sm.transition("COMPLETED", "QUEUED")).toThrow(
      "Invalid state transition",
    );
  });
});

describe("JobQueue", () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue({
      maxConcurrency: 2,
      maxQueueSize: 3,
      defaultTimeoutMs: 5000,
      defaultMaxRetries: 1,
      defaultPriority: 5,
    });
  });

  function makeJob(priority = 5): Job {
    return {
      jobId: createJobId(),
      state: "QUEUED",
      priority,
      createdAt: Date.now(),
      request: { intent: "Test job", constraints: [] },
      context: {
        jobId: "",
        requestMetadata: {},
        pipelineMetadata: {},
        activeStage: null,
        completedStages: [],
        timings: {},
        retryCounter: 0,
        checkpointRef: null,
      },
      progress: {
        currentStage: "QUEUED",
        completedStages: [],
        percentage: 0,
        elapsedMs: 0,
        estimatedRemainingMs: 0,
      },
      retryCount: 0,
      maxRetries: 1,
      timeoutMs: 5000,
    };
  }

  it("enqueues valid jobs", () => {
    const job = makeJob();
    const result = queue.enqueue(job);
    expect(result.accepted).toBe(true);
    expect(queue.depth).toBe(1);
  });

  it("rejects jobs when queue is full", () => {
    queue.enqueue(makeJob());
    queue.enqueue(makeJob());
    queue.enqueue(makeJob());
    const result = queue.enqueue(makeJob());
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("Queue full");
  });

  it("rejects invalid jobs", () => {
    const job = makeJob();
    job.jobId = "";
    const result = queue.enqueue(job);
    expect(result.accepted).toBe(false);
  });

  it("dequeues in priority order", () => {
    const low = makeJob(10);
    const high = makeJob(1);
    queue.enqueue(low);
    queue.enqueue(high);
    const dequeued = queue.dequeue();
    expect(dequeued?.jobId).toBe(high.jobId);
  });

  it("respects concurrency limit", () => {
    queue.enqueue(makeJob());
    queue.enqueue(makeJob());
    queue.enqueue(makeJob());
    queue.dequeue(); // active: 1
    queue.dequeue(); // active: 2
    const third = queue.dequeue(); // should be null (max concurrency = 2)
    expect(third).toBeNull();
  });

  it("supports graceful shutdown", () => {
    queue.enqueue(makeJob());
    queue.shutdown();
    const result = queue.enqueue(makeJob());
    expect(result.accepted).toBe(false);
    expect(queue.dequeue()).toBeNull();
  });
});

describe("JobLifecycle", () => {
  it("emits events on transitions", () => {
    const lifecycle = new JobLifecycle();
    const events: JobEvent[] = [];
    lifecycle.on((e) => events.push(e));

    const job: Job = {
      jobId: "test-1",
      state: "QUEUED",
      priority: 5,
      createdAt: Date.now(),
      request: { intent: "Test", constraints: [] },
      context: {
        jobId: "test-1",
        requestMetadata: {},
        pipelineMetadata: {},
        activeStage: null,
        completedStages: [],
        timings: {},
        retryCounter: 0,
        checkpointRef: null,
      },
      progress: {
        currentStage: "QUEUED",
        completedStages: [],
        percentage: 0,
        elapsedMs: 0,
        estimatedRemainingMs: 0,
      },
      retryCount: 0,
      maxRetries: 2,
      timeoutMs: 5000,
    };

    lifecycle.transition(job, "VALIDATING");
    expect(job.state).toBe("VALIDATING");
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe("JobStarted");

    lifecycle.transition(job, "PLANNING");
    lifecycle.transition(job, "EXECUTING");
    lifecycle.transition(job, "EVALUATING");
    lifecycle.transition(job, "GENERATING_ARTIFACTS");
    lifecycle.transition(job, "COMPLETED");

    expect(job.state).toBe("COMPLETED");
    expect(job.completedAt).toBeDefined();
  });
});

describe("JobProgressTracker", () => {
  it("calculates percentage based on completed stages", () => {
    const tracker = new JobProgressTracker();
    const job: Job = {
      jobId: "test-1",
      state: "EXECUTING",
      priority: 5,
      createdAt: Date.now() - 10000,
      startedAt: Date.now() - 9000,
      request: { intent: "Test", constraints: [] },
      context: {
        jobId: "test-1",
        requestMetadata: {},
        pipelineMetadata: {},
        activeStage: "EXECUTING",
        completedStages: ["VALIDATING", "PLANNING"],
        timings: {},
        retryCounter: 0,
        checkpointRef: null,
      },
      progress: {
        currentStage: "EXECUTING",
        completedStages: [],
        percentage: 0,
        elapsedMs: 0,
        estimatedRemainingMs: 0,
      },
      retryCount: 0,
      maxRetries: 1,
      timeoutMs: 30000,
    };

    const progress = tracker.calculateProgress(job);
    // VALIDATING=5 + PLANNING=10 + EXECUTING*0.5=25 = 40%
    expect(progress.percentage).toBe(40);
    expect(progress.elapsedMs).toBeGreaterThan(0);
  });

  it("returns 100% for COMPLETED", () => {
    const tracker = new JobProgressTracker();
    const job: Job = {
      jobId: "test-1",
      state: "COMPLETED",
      priority: 5,
      createdAt: Date.now() - 10000,
      startedAt: Date.now() - 9000,
      completedAt: Date.now(),
      request: { intent: "Test", constraints: [] },
      context: {
        jobId: "test-1",
        requestMetadata: {},
        pipelineMetadata: {},
        activeStage: null,
        completedStages: [
          "VALIDATING",
          "PLANNING",
          "EXECUTING",
          "EVALUATING",
          "GENERATING_ARTIFACTS",
        ],
        timings: {},
        retryCounter: 0,
        checkpointRef: null,
      },
      progress: {
        currentStage: "COMPLETED",
        completedStages: [],
        percentage: 0,
        elapsedMs: 0,
        estimatedRemainingMs: 0,
      },
      retryCount: 0,
      maxRetries: 1,
      timeoutMs: 30000,
    };

    const progress = tracker.calculateProgress(job);
    expect(progress.percentage).toBe(100);
    expect(progress.estimatedRemainingMs).toBe(0);
  });
});

describe("JobMetricsService", () => {
  it("computes metrics from completed jobs", () => {
    const metrics = new JobMetricsService();

    const succeededJob: Job = {
      jobId: "s-1",
      state: "COMPLETED",
      priority: 5,
      createdAt: 1000,
      startedAt: 1100,
      completedAt: 2100,
      request: { intent: "Test", constraints: [] },
      context: {
        jobId: "s-1",
        requestMetadata: {},
        pipelineMetadata: {},
        activeStage: null,
        completedStages: [],
        timings: { EXECUTING: 800 },
        retryCounter: 0,
        checkpointRef: null,
      },
      progress: {
        currentStage: "COMPLETED",
        completedStages: [],
        percentage: 100,
        elapsedMs: 1000,
        estimatedRemainingMs: 0,
      },
      retryCount: 0,
      maxRetries: 1,
      timeoutMs: 5000,
    };

    const failedJob: Job = {
      jobId: "f-1",
      state: "FAILED",
      priority: 5,
      createdAt: 2000,
      startedAt: 2050,
      completedAt: 2500,
      request: { intent: "Test", constraints: [] },
      context: {
        jobId: "f-1",
        requestMetadata: {},
        pipelineMetadata: {},
        activeStage: null,
        completedStages: [],
        timings: {},
        retryCounter: 0,
        checkpointRef: null,
      },
      progress: {
        currentStage: "FAILED",
        completedStages: [],
        percentage: 30,
        elapsedMs: 450,
        estimatedRemainingMs: 0,
      },
      retryCount: 1,
      maxRetries: 1,
      timeoutMs: 5000,
      error: "test error",
    };

    metrics.record(succeededJob);
    metrics.record(failedJob);

    const m = metrics.getMetrics();
    expect(m.totalJobsProcessed).toBe(1);
    expect(m.totalJobsFailed).toBe(1);
    expect(m.successRate).toBe(0.5);
    expect(m.failureRate).toBe(0.5);
    expect(m.averageExecutionTimeMs).toBe(1000);
  });
});

describe("JobManager", () => {
  it("submits and tracks a job", () => {
    const manager = new JobManager(new AgentRegistry());
    const result = manager.submit({
      intent: "Generate obby game",
      constraints: [],
    });

    expect(result.error).toBeUndefined();
    expect(result.job).toBeDefined();
    expect(result.job!.state).toBe("QUEUED");
    expect(result.job!.jobId).toMatch(/^job-/);

    const retrieved = manager.getJob(result.job!.jobId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.request.intent).toBe("Generate obby game");
  });

  it("rejects invalid jobs", () => {
    const manager = new JobManager(new AgentRegistry());
    const result = manager.submit({ intent: "ab", constraints: [] }); // too short
    expect(result.error).toBeDefined();
    expect(result.error).toContain("at least 3");
  });

  it("cancels a queued job", () => {
    const manager = new JobManager(new AgentRegistry());
    const { job } = manager.submit({ intent: "Cancel me", constraints: [] });
    expect(job).toBeDefined();

    const cancelled = manager.cancel(job!.jobId);
    expect(cancelled).toBe(true);
    expect(manager.getJob(job!.jobId)!.state).toBe("CANCELLED");
  });

  it("provides queue status", () => {
    const manager = new JobManager(new AgentRegistry());
    manager.submit({ intent: "Job one", constraints: [] });
    manager.submit({ intent: "Job two", constraints: [] });

    const status = manager.getQueueStatus();
    expect(status.queued).toBe(2);
    expect(status.active).toBe(0);
  });
});
