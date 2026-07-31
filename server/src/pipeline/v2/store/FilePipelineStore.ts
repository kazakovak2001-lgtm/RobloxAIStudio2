/**
 * FilePipelineStore — File-based persistent pipeline store.
 * Stores pipeline states as JSON files in a configurable directory.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from "fs";
import { join } from "path";
import type { PipelineState } from "../PipelineStage";
import type { PipelineStore } from "./PipelineStore";

export class FilePipelineStore implements PipelineStore {
  private dir: string;
  private cache: Map<string, PipelineState> = new Map();

  constructor(directory: string) {
    this.dir = directory;
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
    this.loadAll();
  }

  async save(state: PipelineState): Promise<void> {
    const filepath = this.filepath(state.pipelineId);
    writeFileSync(filepath, JSON.stringify(state, null, 2), "utf8");
    this.cache.set(state.pipelineId, state);
  }

  get(pipelineId: string): PipelineState | null {
    return this.cache.get(pipelineId) ?? null;
  }

  getAll(): PipelineState[] {
    return Array.from(this.cache.values());
  }

  async delete(pipelineId: string): Promise<boolean> {
    const filepath = this.filepath(pipelineId);
    if (existsSync(filepath)) unlinkSync(filepath);
    return this.cache.delete(pipelineId);
  }

  has(pipelineId: string): boolean {
    return this.cache.has(pipelineId);
  }

  count(): number {
    return this.cache.size;
  }

  getByStatus(status: string): PipelineState[] {
    return this.getAll().filter((p) => p.status === status);
  }

  async markInterrupted(): Promise<number> {
    let count = 0;
    for (const current of [...this.cache.values()]) {
      if (current.status !== "running") continue;

      const state = structuredClone(current);
      const now = Date.now();
      state.status = "failed";
      state.finishedAt = now;
      state.currentStage = null;
      for (const stage of state.stages) {
        if (stage.status !== "running") continue;
        stage.status = "failed";
        stage.error = "Interrupted: server restart";
        stage.completedAt = now;
        if (!state.failedStages.includes(stage.name)) {
          state.failedStages.push(stage.name);
        }
      }
      await this.save(state);
      count++;
    }
    return count;
  }

  private filepath(pipelineId: string): string {
    const safe = pipelineId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.dir, `${safe}.json`);
  }

  private loadAll(): void {
    try {
      const files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        try {
          const content = readFileSync(join(this.dir, file), "utf8");
          const state = JSON.parse(content) as PipelineState;
          if (state.pipelineId) {
            this.cache.set(state.pipelineId, state);
          }
        } catch {
          console.warn(`[PipelineStore] Failed to load ${file}, skipping`);
        }
      }
      console.log(
        `[PipelineStore] Loaded ${this.cache.size} pipelines from disk`,
      );
    } catch {
      console.warn("[PipelineStore] Failed to read pipeline directory");
    }
  }
}
