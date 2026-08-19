/**
 * Generation History Repository — Stores generation run history per project.
 */

import type {
  DurableMutation,
  StorageProvider,
} from "../../platform/storage/StorageProvider";

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
  record(entry: GenerationRecord): Promise<void>;
  getByProject(projectId: string): GenerationRecord[];
  getByPipeline(pipelineId: string): GenerationRecord | null;
  getAll(): GenerationRecord[];
}

const COLLECTION = "generation_history";

/** Durable implementation backed by the configured StorageProvider. */
export class StorageGenerationHistoryRepository implements GenerationHistoryRepository {
  constructor(private readonly storage: StorageProvider) {}

  async record(entry: GenerationRecord): Promise<void> {
    await this.storage.setDurable(COLLECTION, entry.pipelineId, entry);
  }

  getByProject(projectId: string): GenerationRecord[] {
    return this.storage
      .list<GenerationRecord>(
        COLLECTION,
        (entry) => entry.projectId === projectId,
      )
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  getByPipeline(pipelineId: string): GenerationRecord | null {
    return this.storage.get<GenerationRecord>(COLLECTION, pipelineId);
  }

  getAll(): GenerationRecord[] {
    return this.storage
      .list<GenerationRecord>(COLLECTION)
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  /** PROJECT-ERASURE-1. Every history record owned by this project, as mutations only. */
  prepareProjectDeletion(projectId: string): DurableMutation[] {
    return this.storage
      .list<GenerationRecord>(
        COLLECTION,
        (entry) => entry.projectId === projectId,
      )
      .map((entry) => ({
        operation: "delete" as const,
        collection: COLLECTION,
        id: entry.pipelineId,
      }));
  }
}

export class InMemoryGenerationHistoryRepository implements GenerationHistoryRepository {
  private entries: GenerationRecord[] = [];

  async record(entry: GenerationRecord): Promise<void> {
    // Update existing or add new
    const idx = this.entries.findIndex(
      (candidate) => candidate.pipelineId === entry.pipelineId,
    );
    if (idx >= 0) {
      this.entries[idx] = entry;
    } else {
      this.entries.push(entry);
    }
  }

  getByProject(projectId: string): GenerationRecord[] {
    return this.entries
      .filter((entry) => entry.projectId === projectId)
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  getByPipeline(pipelineId: string): GenerationRecord | null {
    return (
      this.entries.find((entry) => entry.pipelineId === pipelineId) ?? null
    );
  }

  getAll(): GenerationRecord[] {
    return [...this.entries].sort(
      (left, right) => right.startedAt - left.startedAt,
    );
  }
}
