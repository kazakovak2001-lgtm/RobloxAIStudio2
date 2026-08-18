import type { GenerationExecution } from "../../types/blueprint";
import {
  DurableStorageConflictError,
  type DurableMutation,
  type StorageProvider,
} from "../storage/StorageProvider";

interface GenerationProjectState {
  id?: string;
  generationCount: number;
  status?: string;
  qualityScore?: number;
  updatedAt?: number;
}

interface GenerationProjectRepository {
  get(projectId: string): GenerationProjectState | null;
  updateDurable(
    projectId: string,
    updates: { status: "generating"; generationCount: number },
  ): Promise<unknown>;
}

const PROJECTS = "projects";
const GENERATION_HISTORY = "generation_history";
const GENERATION_EXECUTIONS = "generation_executions";
/**
 * AUDIT-DUP-GENERATION-001 and AUDIT-OUTCOME-LAST-WRITER-001.
 *
 * One record per project naming the generation that currently owns it. Written
 * with `requireAbsent` inside the start transaction, so a second start for the
 * same project is refused by durable storage rather than by a process-local
 * lock — which is what makes the invariant hold across instances. Released by
 * the run that owns it when it reaches a terminal state.
 */
const GENERATION_ACTIVE_CLAIMS = "generation_active_claims";
const GENERATION_START_REQUESTS = "generation_start_requests";
const projectQueues = new Map<string, Promise<void>>();

/** Names the generation currently allowed to act on a project. */
export interface GenerationActiveClaim {
  executionId: string;
  startedAt: number;
}

/**
 * MAR-004. What a start request was, so a repeat of it can be recognised.
 *
 * Kept durably and committed with the start it identifies. A caller whose
 * response was lost cannot tell a succeeded request from one that never
 * arrived, and without this the only answers available were a conflict naming
 * an execution they could not identify as their own, or — once the run had
 * finished and released its claim — a silent second generation.
 */
export interface GenerationStartRequestRecord {
  key: string;
  projectId: string;
  principal: string;
  /** Distinguishes two different requests that reused one key. */
  fingerprint: string;
  executionId: string;
  createdAt: number;
}

/** Identifies one start request for replay. */
export interface GenerationStartRequest<T> {
  key: string;
  principal: string;
  fingerprint: string;
  /**
   * Rebuilds the caller's result for an execution that already started.
   *
   * The coordinator does not invent it: on a replay nothing was prepared, so
   * the only honest source for the caller's shape is the caller.
   */
  replay: (executionId: string) => Promise<T>;
}

/**
 * Raised when one idempotency key is used for two different requests.
 *
 * Answering with the first execution would hand one caller's run to another, or
 * silently substitute a different payload's result. Two requests claiming one
 * identity is a caller defect, and guessing which one was meant is not
 * something storage can do.
 */
export class IdempotencyConflictError extends Error {
  constructor(
    readonly key: string,
    readonly projectId: string,
  ) {
    super(
      `Idempotency key ${key} on project ${projectId} was already used for a different request`,
    );
    this.name = "IdempotencyConflictError";
  }
}

/** Raised when a project already has an active generation. */
export class ActiveGenerationConflictError extends Error {
  constructor(
    readonly projectId: string,
    readonly activeExecutionId?: string,
  ) {
    super(
      `Project ${projectId} already has an active generation${
        activeExecutionId ? ` (${activeExecutionId})` : ""
      }`,
    );
    this.name = "ActiveGenerationConflictError";
  }
}

function normalizeDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeExecution(
  execution: GenerationExecution,
): GenerationExecution {
  return {
    ...execution,
    started_at: normalizeDate(execution.started_at),
    ...(execution.completed_at
      ? { completed_at: normalizeDate(execution.completed_at) }
      : {}),
    pipeline_steps: execution.pipeline_steps.map((step) => ({
      ...step,
      ...(step.started_at
        ? { started_at: normalizeDate(step.started_at) }
        : {}),
      ...(step.completed_at
        ? { completed_at: normalizeDate(step.completed_at) }
        : {}),
    })),
  };
}

function equivalentOutcome(
  existing: GenerationExecution,
  candidate: GenerationExecution,
): boolean {
  return JSON.stringify(existing) === JSON.stringify(candidate);
}

async function withProjectLock<T>(
  projectId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = projectQueues.get(projectId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const tracked = current.then(
    () => undefined,
    () => undefined,
  );
  projectQueues.set(projectId, tracked);

  try {
    return await current;
  } finally {
    if (projectQueues.get(projectId) === tracked) {
      projectQueues.delete(projectId);
    }
  }
}

export class GenerationOutcomeCoordinator {
  constructor(private readonly storage: StorageProvider) {}

  async commit(
    executionId: string,
    updates: Partial<GenerationExecution>,
  ): Promise<GenerationExecution | null> {
    const initial = this.storage.get<GenerationExecution>(
      GENERATION_EXECUTIONS,
      executionId,
    );
    if (!initial) return null;

    return withProjectLock(initial.project_id, async () => {
      const rawExisting = this.storage.get<GenerationExecution>(
        GENERATION_EXECUTIONS,
        executionId,
      );
      if (!rawExisting) return null;
      const existing = normalizeExecution(rawExisting);

      const project = this.storage.get<GenerationProjectState>(
        PROJECTS,
        existing.project_id,
      );
      if (!project) {
        throw new Error(`Project ${existing.project_id} not found`);
      }

      const existingTerminal =
        existing.status === "completed" || existing.status === "failed";
      if (
        existingTerminal &&
        updates.status !== undefined &&
        updates.status !== existing.status
      ) {
        throw new DurableStorageConflictError(
          `Execution ${existing.id} is already ${existing.status}; refusing transition to ${updates.status}`,
          GENERATION_EXECUTIONS,
          existing.id,
        );
      }

      const execution = normalizeExecution({
        ...existing,
        ...updates,
        id: existing.id,
        project_id: existing.project_id,
        blueprint_id: existing.blueprint_id,
        user_id: existing.user_id,
        started_at: existing.started_at,
        retry_count: existing.retry_count,
        pipeline_steps: updates.pipeline_steps ?? existing.pipeline_steps,
      });

      if (existingTerminal && equivalentOutcome(existing, execution)) {
        return existing;
      }

      const terminalStatus =
        execution.status === "completed" ? "ready" : "draft";
      const evaluatedScores = execution.pipeline_steps
        .map((step) => step.evaluation?.qualityScore)
        .filter((score): score is number => typeof score === "number");
      const qualityScore =
        evaluatedScores.length > 0
          ? Math.round(
              evaluatedScores.reduce((sum, score) => sum + score, 0) /
                evaluatedScores.length,
            )
          : project.qualityScore;
      const updatedProject: GenerationProjectState = {
        ...project,
        status: terminalStatus,
        ...(terminalStatus === "ready" && qualityScore !== undefined
          ? { qualityScore }
          : {}),
        updatedAt: Date.now(),
      };
      const stagesCompleted = execution.pipeline_steps.filter(
        (step) => step.status === "completed",
      ).length;
      const failures = execution.pipeline_steps.filter(
        (step) => step.status === "failed",
      ).length;
      const startedAt = execution.started_at.getTime();
      const finishedAt = execution.completed_at?.getTime();
      const history = {
        id: execution.id,
        projectId: execution.project_id,
        pipelineId: execution.id,
        status: execution.status,
        startedAt,
        ...(finishedAt !== undefined ? { finishedAt } : {}),
        ...(execution.total_duration_ms !== undefined
          ? { duration: execution.total_duration_ms }
          : {}),
        stagesCompleted,
        stagesTotal: execution.pipeline_steps.length,
        failures,
        tokenUsage: 0,
        aiCost: 0,
      };

      // AUDIT-OUTCOME-LAST-WRITER-001. Two runs of one project can finish in
      // either order. The run that still owns the project's claim is the
      // authoritative one; an older run that finishes later may close its own
      // record, but must not rewrite the project or release someone else's
      // claim. Without this, a stale run silently overwrote the newer outcome.
      const claim = this.storage.get<GenerationActiveClaim>(
        GENERATION_ACTIVE_CLAIMS,
        existing.project_id,
      );
      // Refuse only when the project is demonstrably owned by someone else. No
      // claim at all is not evidence of foreign ownership: an execution started
      // before this record existed, or through the path that persists an
      // execution on its own, still has to be able to close out its project.
      const ownsProject = !claim || claim.executionId === execution.id;
      const holdsClaim = claim?.executionId === execution.id;

      await this.storage.applyDurableBatch([
        {
          operation: "set",
          collection: GENERATION_EXECUTIONS,
          id: execution.id,
          data: execution,
        },
        {
          operation: "set",
          collection: GENERATION_HISTORY,
          id: execution.id,
          data: history,
        },
        ...(ownsProject
          ? ([
              {
                operation: "set",
                collection: PROJECTS,
                id: existing.project_id,
                data: updatedProject,
              },
            ] as const)
          : []),
        ...(holdsClaim
          ? ([
              {
                operation: "delete",
                collection: GENERATION_ACTIVE_CLAIMS,
                id: existing.project_id,
              },
            ] as const)
          : []),
      ]);
      return execution;
    });
  }
}

export class ProjectGenerationStartCoordinator {
  constructor(
    private readonly projects: GenerationProjectRepository,
    private readonly storage: StorageProvider,
  ) {}

  /**
   * AUDIT-START-ATOMICITY-001.
   *
   * Start evidence commits as one transaction. The previous implementation
   * wrote the project (status/generationCount), then the execution, then the
   * start history as three independent durable writes, so a rejection anywhere
   * after the first left the project falsely claiming `generating` with an
   * incremented count and no execution to ever repair it.
   *
   * `prepare` must not write anything durable and must not start process-local
   * work. Everything durable goes through the single `applyDurableBatch` below,
   * whose contract is that no cache change becomes visible unless every
   * mutation commits and a rejection preserves the exact pre-transaction state.
   * `afterCommit` runs only once that transaction has committed, which is where
   * process-local work such as enqueueing the pipeline belongs.
   *
   * This mirrors `GenerationOutcomeCoordinator.commit` above, which already
   * commits execution + history + project together; the start path was the
   * asymmetric one.
   */
  async start<T>(
    projectId: string,
    prepare: () => Promise<T>,
    buildStartEvidence: (result: T) => readonly DurableMutation[],
    resolveExecutionId: (result: T) => string,
    afterCommit?: (result: T) => void,
    request?: GenerationStartRequest<T>,
  ): Promise<T> {
    return withProjectLock(projectId, async () => {
      const project = this.projects.get(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // MAR-004. Answered before anything is prepared, so a replay costs no
      // provider budget and schedules no work. Read from storage rather than
      // from memory, so a second process and a restarted one answer alike.
      //
      // Keyed by `request.key` alone, not `${projectId}:${key}`. The key is
      // meant to name one logical request no matter what it is pointed at, so
      // the same key surfacing against a different project has to collide with
      // the first record and fail closed — a caller bug worth surfacing, not
      // two unrelated projects each quietly getting their own start under a
      // key that was supposed to be unique. Partitioning storage by project
      // would have made that collision structurally impossible to detect,
      // because the two requests would simply never look at the same record.
      if (request) {
        const recorded = this.storage.get<GenerationStartRequestRecord>(
          GENERATION_START_REQUESTS,
          request.key,
        );
        if (recorded) {
          if (
            recorded.projectId !== projectId ||
            recorded.principal !== request.principal ||
            recorded.fingerprint !== request.fingerprint
          ) {
            throw new IdempotencyConflictError(request.key, projectId);
          }
          return request.replay(recorded.executionId);
        }
      }

      // Nothing durable yet: a rejection here leaves no state at all.
      const result = await prepare();

      // Spread the stored record so unrelated project fields survive, matching
      // what SaaSProjectRepository.updateDurable would have preserved.
      const stored =
        this.storage.get<GenerationProjectState>(PROJECTS, projectId) ??
        project;
      const updatedProject: GenerationProjectState = {
        ...stored,
        status: "generating",
        generationCount: project.generationCount + 1,
        updatedAt: Date.now(),
      };

      const claim: GenerationActiveClaim = {
        executionId: resolveExecutionId(result),
        startedAt: Date.now(),
      };

      try {
        await this.storage.applyDurableBatch([
          ...buildStartEvidence(result),
          {
            operation: "set",
            collection: PROJECTS,
            id: projectId,
            data: updatedProject,
          },
          // Admission and evidence commit together. `requireAbsent` makes the
          // second concurrent start fail the whole batch, so a duplicate leaves
          // no execution, no history and no incremented count behind — and the
          // decision is taken by durable storage, so a second process reaches
          // the same answer.
          {
            operation: "set",
            collection: GENERATION_ACTIVE_CLAIMS,
            id: projectId,
            data: claim,
            requireAbsent: true,
          },
          // In the same transaction as the evidence and the claim. A record
          // written outside it would answer a later retry with an execution
          // that was never created, and one written after the response would
          // leave the crash window this exists to close.
          ...(request
            ? ([
                {
                  operation: "set",
                  collection: GENERATION_START_REQUESTS,
                  id: request.key,
                  data: {
                    key: request.key,
                    projectId,
                    principal: request.principal,
                    fingerprint: request.fingerprint,
                    executionId: claim.executionId,
                    createdAt: Date.now(),
                  } satisfies GenerationStartRequestRecord,
                  requireAbsent: true,
                },
              ] as const)
            : []),
        ]);
      } catch (error) {
        if (error instanceof DurableStorageConflictError) {
          // Which `requireAbsent` lost the race decides which conflict this
          // is. Both share this catch because both come out of the same
          // batch, but they are different facts: the claim conflicting means
          // another execution already owns this project, while the request
          // record conflicting means this exact key was claimed by a
          // concurrent call — possibly for a different project — before this
          // one committed.
          if (request && error.collection === GENERATION_START_REQUESTS) {
            throw new IdempotencyConflictError(request.key, projectId);
          }
          const active = this.storage.get<GenerationActiveClaim>(
            GENERATION_ACTIVE_CLAIMS,
            projectId,
          );
          throw new ActiveGenerationConflictError(
            projectId,
            active?.executionId,
          );
        }
        throw error;
      }

      afterCommit?.(result);
      return result;
    });
  }
}

export async function recordProjectOutcomeBestEffort(
  recordOutcome: () => void,
  persistProject: () => Promise<unknown>,
  reportFailure: (error: unknown) => void,
): Promise<void> {
  recordOutcome();
  try {
    await persistProject();
  } catch (error) {
    reportFailure(error);
  }
}
