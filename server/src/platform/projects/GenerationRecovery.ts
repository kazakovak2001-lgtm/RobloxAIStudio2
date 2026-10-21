/**
 * AUDIT-RECOVERY-001 and AUDIT-GRACEFUL-SHUTDOWN-001 — canonical generation
 * must not stay `running` forever.
 *
 * The execution record is durable but the worker that advances it is
 * process-local, so a crash or a SIGTERM mid-run left an execution durably
 * `running` with nothing left to finish it, and its project stuck in
 * `generating`. Nothing swept those up, so the project stayed unusable and, now
 * that admission is claim-based, permanently unable to start a new generation.
 *
 * This does not resume work. Resuming mid-LLM-request is not the goal; ending
 * the lie is. An interrupted run is closed truthfully, its project is released,
 * and its claim is dropped so the next generation can be admitted.
 *
 * The mechanism is deliberately the one AutonomousOrchestrator already uses
 * (see `OperationalStoreComposition.markInterrupted`): a recovery claim written
 * with `requireAbsent` in the same batch as the state change, so two instances
 * recovering the same execution cannot both act on it. This is not a second
 * recovery framework, it is the same idea applied to the canonical path.
 */

import {
  DurableStorageConflictError,
  type DurableMutation,
  type StorageProvider,
} from "../storage/StorageProvider";
import type { GenerationExecution } from "../../types/blueprint";

const PROJECTS = "projects";
const GENERATION_EXECUTIONS = "generation_executions";
const GENERATION_HISTORY = "generation_history";
const GENERATION_ACTIVE_CLAIMS = "generation_active_claims";
const GENERATION_RECOVERY_CLAIMS = "generation_recovery_claims";

/** Greppable, and states the cause rather than implying the run itself failed. */
export const RESTART_INTERRUPTION_MESSAGE =
  "Interrupted by a backend restart: no worker was running for this execution.";

interface ProjectRecord {
  status?: string;
  updatedAt?: number;
}

interface ActiveClaim {
  executionId: string;
}

export interface GenerationRecoveryReport {
  /** Executions closed as interrupted by this instance. */
  interrupted: string[];
  /** Executions another instance was already recovering. */
  skipped: string[];
}

/**
 * Close every execution left `running` by a previous process.
 *
 * Safe to call on every boot and from more than one instance at once: the
 * recovery claim decides who acts, and an execution already terminal is not
 * touched at all.
 */
export async function reconcileInterruptedGenerations(
  storage: StorageProvider,
  now: number = Date.now(),
): Promise<GenerationRecoveryReport> {
  const stranded = storage.list<GenerationExecution>(
    GENERATION_EXECUTIONS,
    (execution) => execution.status === "running",
  );

  const report: GenerationRecoveryReport = { interrupted: [], skipped: [] };

  for (const execution of stranded) {
    const interrupted: GenerationExecution = {
      ...execution,
      status: "failed",
      completed_at: new Date(now),
      error_message: RESTART_INTERRUPTION_MESSAGE,
      restart_interrupted_at: now,
    };

    const mutations: DurableMutation[] = [
      // Claims the recovery first. A second instance doing this concurrently
      // fails the whole batch and leaves the execution to whoever won.
      {
        operation: "set",
        collection: GENERATION_RECOVERY_CLAIMS,
        id: execution.id,
        data: { executionId: execution.id, interruptedAt: now },
        requireAbsent: true,
      },
      {
        operation: "set",
        collection: GENERATION_EXECUTIONS,
        id: execution.id,
        data: interrupted,
      },
    ];

    const history = storage.get<Record<string, unknown>>(
      GENERATION_HISTORY,
      execution.id,
    );
    if (history) {
      mutations.push({
        operation: "set",
        collection: GENERATION_HISTORY,
        id: execution.id,
        data: { ...history, status: "failed", finishedAt: now },
      });
    }

    // Release the project only if this execution is the one holding it. A
    // project already taken over by a newer generation must not be reset by
    // the sweep that tidies up an older one.
    const claim = storage.get<ActiveClaim>(
      GENERATION_ACTIVE_CLAIMS,
      execution.project_id,
    );
    if (claim?.executionId === execution.id) {
      const project = storage.get<ProjectRecord>(
        PROJECTS,
        execution.project_id,
      );
      if (project?.status === "generating") {
        mutations.push({
          operation: "set",
          collection: PROJECTS,
          id: execution.project_id,
          data: { ...project, status: "draft", updatedAt: now },
        });
      }
      mutations.push({
        operation: "delete",
        collection: GENERATION_ACTIVE_CLAIMS,
        id: execution.project_id,
      });
    }

    try {
      await storage.applyDurableBatch(mutations);
      report.interrupted.push(execution.id);
    } catch (error) {
      if (error instanceof DurableStorageConflictError) {
        report.skipped.push(execution.id);
        continue;
      }
      throw error;
    }
  }

  if (report.interrupted.length > 0) {
    console.warn(
      `[generation-recovery] closed ${report.interrupted.length} execution(s) interrupted by restart: ${report.interrupted.join(", ")}`,
    );
  }
  return report;
}
