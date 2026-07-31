/**
 * StorageFactory — Creates the appropriate StorageProvider based on configuration.
 *
 * Set STORAGE_PROVIDER=postgres to use PostgreSQL.
 * Default: inmemory
 */

import type { PipelineState } from "../../pipeline/v2/PipelineStage";
import { configurePipelineStoreFactory } from "../../pipeline/v2/store/PipelineStore";
import {
  DurableStorageConflictError,
  type DurableMutation,
  type StorageProvider,
} from "./StorageProvider";
import { InMemoryStorageProvider } from "./StorageProvider";
import { PostgresStorageProvider } from "./postgres/PostgresStorageProvider";

export type { StorageProvider } from "./StorageProvider";
export type StorageProviderType = "inmemory" | "postgres";
export type StoragePostInitializeHook = () => Promise<void>;

const PIPELINE_STATES = "pipeline_runtime_states";
const PIPELINE_RECOVERY_CLAIMS = "pipeline_runtime_recovery_claims";

export class StoragePipelineStore {
  private readonly recoveredSnapshots = new Map<string, PipelineState>();

  constructor(private readonly storage: StorageProvider) {}

  async save(state: PipelineState): Promise<void> {
    const snapshot = this.clone(state);
    await this.storage.setDurable(
      PIPELINE_STATES,
      snapshot.pipelineId,
      snapshot,
    );
    this.recoveredSnapshots.delete(snapshot.pipelineId);
  }

  get(pipelineId: string): PipelineState | null {
    const recovered = this.recoveredSnapshots.get(pipelineId);
    if (recovered) return this.clone(recovered);

    const state = this.storage.get<PipelineState>(PIPELINE_STATES, pipelineId);
    return state ? this.clone(state) : null;
  }

  getAll(): PipelineState[] {
    const states = new Map(
      this.storage
        .list<PipelineState>(PIPELINE_STATES)
        .map((state) => [state.pipelineId, this.clone(state)]),
    );
    for (const [pipelineId, recovered] of this.recoveredSnapshots) {
      states.set(pipelineId, this.clone(recovered));
    }
    return [...states.values()];
  }

  async delete(pipelineId: string): Promise<boolean> {
    const deleted = await this.storage.deleteDurable(
      PIPELINE_STATES,
      pipelineId,
    );
    if (deleted) this.recoveredSnapshots.delete(pipelineId);
    return deleted;
  }

  has(pipelineId: string): boolean {
    return this.get(pipelineId) !== null;
  }

  count(): number {
    return this.getAll().length;
  }

  getByStatus(status: string): PipelineState[] {
    return this.getAll().filter((candidate) => candidate.status === status);
  }

  async markInterrupted(): Promise<number> {
    const running = this.getAll().filter(
      (candidate) => candidate.status === "running",
    );
    let interruptedCount = 0;

    for (const state of running) {
      const interrupted = this.createInterruptedSnapshot(state);
      const mutations: DurableMutation[] = [
        {
          operation: "set",
          collection: PIPELINE_RECOVERY_CLAIMS,
          id: interrupted.pipelineId,
          data: {
            pipelineId: interrupted.pipelineId,
            interruptedAt: interrupted.finishedAt,
          },
          requireAbsent: true,
        },
        {
          operation: "set",
          collection: PIPELINE_STATES,
          id: interrupted.pipelineId,
          data: interrupted,
        },
      ];

      try {
        await this.storage.applyDurableBatch(mutations);
        this.recoveredSnapshots.delete(interrupted.pipelineId);
        interruptedCount += 1;
      } catch (error) {
        if (!(error instanceof DurableStorageConflictError)) throw error;

        // Another process committed the same deterministic recovery snapshot.
        // Preserve truthful reads even when this provider's cache was hydrated
        // before the winning transaction completed.
        this.recoveredSnapshots.set(interrupted.pipelineId, interrupted);
      }
    }

    return interruptedCount;
  }

  private createInterruptedSnapshot(state: PipelineState): PipelineState {
    const interrupted = this.clone(state);
    const runningStage = interrupted.stages.find(
      (stage) => stage.status === "running",
    );
    const interruptedAt = runningStage?.startedAt ?? interrupted.startedAt;

    interrupted.status = "failed";
    interrupted.finishedAt = interruptedAt;
    interrupted.currentStage = null;

    for (const stage of interrupted.stages) {
      if (stage.status !== "running") continue;
      stage.status = "failed";
      stage.error = "Interrupted: server restart";
      stage.completedAt = interruptedAt;
      if (!interrupted.failedStages.includes(stage.name)) {
        interrupted.failedStages.push(stage.name);
      }
    }

    return interrupted;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

let configuredStorageProvider: StorageProvider | null = null;
const postInitializeHooks = new Set<StoragePostInitializeHook>();

export function createStorageProvider(): StorageProvider {
  const providerType = (process.env.STORAGE_PROVIDER ??
    "inmemory") as StorageProviderType;

  switch (providerType) {
    case "postgres":
      if (!process.env.DATABASE_URL) {
        throw new Error(
          "STORAGE_PROVIDER=postgres requires DATABASE_URL; refusing cache-only production storage.",
        );
      }
      console.log("[Storage] Using PostgreSQL provider");
      configuredStorageProvider = new PostgresStorageProvider({ strict: true });
      break;
    case "inmemory":
    default:
      console.log("[Storage] Using InMemory provider");
      configuredStorageProvider = new InMemoryStorageProvider();
      break;
  }

  const provider = configuredStorageProvider;
  configurePipelineStoreFactory(() => new StoragePipelineStore(provider));
  return provider;
}

/**
 * Returns the provider created during application bootstrap.
 * Compatibility repositories use this accessor when an older constructor does
 * not yet accept explicit dependency injection.
 */
export function getConfiguredStorageProvider(): StorageProvider | null {
  return configuredStorageProvider;
}

export function registerStoragePostInitializeHook(
  hook: StoragePostInitializeHook,
): () => void {
  postInitializeHooks.add(hook);
  return () => postInitializeHooks.delete(hook);
}

export async function initializeStorageProvider(
  provider: StorageProvider,
): Promise<void> {
  await provider.ready?.();
  for (const hook of postInitializeHooks) {
    await hook();
  }
}

export async function flushStorageProvider(
  provider: StorageProvider,
): Promise<void> {
  await provider.flush?.();
}

export async function closeStorageProvider(
  provider: StorageProvider,
): Promise<void> {
  await provider.close?.();
}

export function getStorageType(): StorageProviderType {
  return (process.env.STORAGE_PROVIDER ?? "inmemory") as StorageProviderType;
}
