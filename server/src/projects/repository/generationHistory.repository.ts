/**
 * Generation History Repository — Stores generation run history per project.
 */

export interface GenerationRecord {
  id: string;
  projectId: string;
  pipelineId: string;
  conceptId?: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  duration?: number;
  stagesCompleted: number;
  stagesTotal: number;
  failures: number;
  tokenUsage: number;
  aiCost: number;
}

export interface GenerationHistoryRepository {
  record(entry: GenerationRecord): void;
  getByProject(projectId: string): GenerationRecord[];
  getByPipeline(pipelineId: string): GenerationRecord | null;
  getAll(): GenerationRecord[];
}

export class InMemoryGenerationHistoryRepository implements GenerationHistoryRepository {
  private entries: GenerationRecord[] = [];

  record(entry: GenerationRecord): void {
    // Update existing or add new
    const idx = this.entries.findIndex(
      (e) => e.pipelineId === entry.pipelineId,
    );
    if (idx >= 0) {
      this.entries[idx] = entry;
    } else {
      this.entries.push(entry);
    }
  }

  getByProject(projectId: string): GenerationRecord[] {
    return this.entries
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  getByPipeline(pipelineId: string): GenerationRecord | null {
    return this.entries.find((e) => e.pipelineId === pipelineId) ?? null;
  }

  getAll(): GenerationRecord[] {
    return [...this.entries].sort((a, b) => b.startedAt - a.startedAt);
  }
}
