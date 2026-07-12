/**
 * GenerationQueue — Job queue for generation requests with status tracking.
 */

import { randomUUID } from "crypto";

export type JobStatus =
  | "queued"
  | "running"
  | "validating"
  | "repairing"
  | "completed"
  | "failed"
  | "cancelled";

export interface GenerationJob {
  id: string;
  projectId: string;
  userId: string;
  status: JobStatus;
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
  error?: string;
  result?: Record<string, unknown>;
}

export class GenerationQueue {
  private jobs: Map<string, GenerationJob> = new Map();
  private queue: string[] = [];

  enqueue(projectId: string, userId: string, priority = 5): GenerationJob {
    const job: GenerationJob = {
      id: `job-${randomUUID().slice(0, 10)}`,
      projectId,
      userId,
      status: "queued",
      priority,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.queue.sort(
      (a, b) =>
        (this.jobs.get(a)?.priority ?? 5) - (this.jobs.get(b)?.priority ?? 5),
    );
    return job;
  }

  dequeue(): GenerationJob | null {
    const id = this.queue.shift();
    if (!id) return null;
    const job = this.jobs.get(id);
    if (job) {
      job.status = "running";
      job.startedAt = Date.now();
    }
    return job ?? null;
  }

  complete(jobId: string, result?: Record<string, unknown>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "completed";
    job.completedAt = Date.now();
    job.result = result;
  }

  fail(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.retryCount < job.maxRetries) {
      job.retryCount++;
      job.status = "queued";
      this.queue.push(jobId);
    } else {
      job.status = "failed";
      job.error = error;
      job.completedAt = Date.now();
    }
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === "completed" || job.status === "failed")
      return false;
    job.status = "cancelled";
    job.completedAt = Date.now();
    this.queue = this.queue.filter((id) => id !== jobId);
    return true;
  }

  getJob(jobId: string): GenerationJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  getByUser(userId: string): GenerationJob[] {
    return [...this.jobs.values()].filter((j) => j.userId === userId);
  }

  getPending(): GenerationJob[] {
    return this.queue.map((id) => this.jobs.get(id)!).filter(Boolean);
  }

  getStats(): {
    queued: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const all = [...this.jobs.values()];
    return {
      queued: all.filter((j) => j.status === "queued").length,
      running: all.filter((j) => j.status === "running").length,
      completed: all.filter((j) => j.status === "completed").length,
      failed: all.filter((j) => j.status === "failed").length,
    };
  }
}
