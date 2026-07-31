import type { GenerationExecution } from "../../types/blueprint";
import {
  DurableStorageConflictError,
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
const projectQueues = new Map<string, Promise<void>>();

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
        {
          operation: "set",
          collection: PROJECTS,
          id: existing.project_id,
          data: updatedProject,
        },
      ]);
      return execution;
    });
  }
}

export class ProjectGenerationStartCoordinator {
  constructor(private readonly projects: GenerationProjectRepository) {}

  async start<T>(
    projectId: string,
    schedule: () => Promise<T>,
    recordHistory: (result: T) => Promise<void>,
  ): Promise<T> {
    return withProjectLock(projectId, async () => {
      const project = this.projects.get(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      await this.projects.updateDurable(projectId, {
        status: "generating",
        generationCount: project.generationCount + 1,
      });

      const result = await schedule();
      await recordHistory(result);
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
