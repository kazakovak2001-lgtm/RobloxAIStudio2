interface GenerationProjectState {
  generationCount: number;
}

interface GenerationProjectRepository {
  get(projectId: string): GenerationProjectState | null;
  updateDurable(
    projectId: string,
    updates: { status: "generating"; generationCount: number },
  ): Promise<unknown>;
}

export class ProjectGenerationStartCoordinator {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly projects: GenerationProjectRepository) {}

  async start<T>(
    projectId: string,
    schedule: () => Promise<T>,
    recordHistory: (result: T) => void,
  ): Promise<T> {
    const previous = this.queues.get(projectId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      const project = this.projects.get(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      await this.projects.updateDurable(projectId, {
        status: "generating",
        generationCount: project.generationCount + 1,
      });

      const result = await schedule();
      recordHistory(result);
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
