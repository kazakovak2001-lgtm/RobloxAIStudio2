import type { StorageProvider } from "../storage/StorageProvider";

interface GenerationProjectState {
  id?: string;
  generationCount: number;
  status?: string;
  qualityScore?: number;
  updatedAt?: number;
  [key: string]: unknown;
}

interface GenerationProjectRepository {
  get(projectId: string): GenerationProjectState | null;
  updateDurable(
    projectId: string,
    updates: { status: "generating"; generationCount: number },
  ): Promise<unknown>;
}

interface GenerationPipelineStep {
  status: string;
}

export interface GenerationExecutionState {
  id: string;
  project_id: string;
  blueprint_id: string;
  user_id: string;
  status: string;
  started_at: Date;
  completed_at?: Date;
  total_duration_ms?: number;
  pipeline_steps: GenerationPipelineStep[];
  [key: string]: unknown;
}

const PROJECTS = "projects";
const GENERATION_HISTORY = "generation_history";
const GENERATION_EXECUTIONS = "generation_executions";

export class GenerationOutcomeCoordinator {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly storage: StorageProvider) {}

  async commit(
    executionId: string,
    updates: Partial<GenerationExecutionState>,
  ): Promise<GenerationExecutionState | null> {
    return this.withExecutionLock(executionId, async () => {
      const existing = this.storage.get<GenerationExecutionState>(
        GENERATION_EXECUTIONS,
        executionId,
      );
      if (!existing) return null;

      const project = this.storage.get<GenerationProjectState>(
        PROJECTS,
        existing.project_id,
      );
      if (!project) {
        throw new Error(`Project ${existing.project_id} not found`);
      }

      if (
        (existing.status === "completed" || existing.status === "failed") &&
        existing.status === updates.status
      ) {
        return existing;
      }

      const execution: GenerationExecutionState = {
        ...existing,
        ...updates,
        id: existing.id,
        project_id: existing.project_id,
        blueprint_id: existing.blueprint_id,
        user_id: existing.user_id,
        started_at: existing.started_at,
        pipeline_steps: updates.pipeline_steps ?? existing.pipeline_steps,
      };
      const terminalStatus = execution.status === "completed" ? "ready" : "draft";
      const updatedProject: GenerationProjectState = {
        ...project,
        status: terminalStatus,
        ...(terminalStatus === "ready" ? { qualityScore: 100 } : {}),
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

  private async withExecutionLock<T>(
    executionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(executionId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const tracked = current.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(executionId, tracked);

    try {
      return await current;
    } finally {
      if (this.queues.get(executionId) === tracked) {
        this.queues.delete(executionId);
      }
    }
  }
}

export class ProjectGenerationStartCoordinator {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly projects: GenerationProjectRepository) {}

  async start<T>(
    projectId: string,
    schedule: () => Promise<T>,
    recordHistory: (result: T) => Promise<void>,
  ): Promise<T> {
    const previous = this.queues.get(projectId) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
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
    const tracked = operation.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(projectId, tracked);

    try {
      return await operation;
    } finally {
      if (this.queues.get(projectId) === tracked) {
        this.queues.delete(projectId);
      }
    }
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
