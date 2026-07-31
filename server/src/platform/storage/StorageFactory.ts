/**
 * StorageFactory — Creates the appropriate StorageProvider based on configuration.
 *
 * Set STORAGE_PROVIDER=postgres to use PostgreSQL.
 * Default: inmemory
 */

import type { PipelineState } from "../../pipeline/v2/PipelineStage";
import type { DurableMutation, StorageProvider } from "./StorageProvider";
import { InMemoryStorageProvider } from "./StorageProvider";
import { PostgresStorageProvider } from "./postgres/PostgresStorageProvider";

export type { StorageProvider } from "./StorageProvider";
export type StorageProviderType = "inmemory" | "postgres";
export type StoragePostInitializeHook = () => Promise<void>;

const PIPELINE_STATES = "pipeline_runtime_states";

export class StoragePipelineStore {
  constructor(private readonly storage: StorageProvider) {}

  async save(state: PipelineState): Promise<void> {
    const snapshot = this.clone(state);
    await this.storage.setDurable(
      PIPELINE_STATES,
      snapshot.pipelineId,
      snapshot,
    );
  }

  get(pipelineId: string): PipelineState | null {
    const state = this.storage.get<PipelineState>(PIPELINE_STATES, pipelineId);
    return state ? this.clone(state) : null;
  }

  getAll(): PipelineState[] {
    return this.storage
      .list<PipelineState>(PIPELINE_STATES)
      .map((state) => this.clone(state));
  }

  async delete(pipelineId: string): Promise<boolean> {
    return this.storage.deleteDurable(PIPELINE_STATES, pipelineId);
  }

  has(pipelineId: string): boolean {
    return this.storage.get(PIPELINE_STATES, pipelineId) !== null;
  }

  count(): number {
    return this.storage.list(PIPELINE_STATES).length;
  }

  getByStatus(status: string): PipelineState[] {
    return this.storage
      .list<PipelineState>(
        PIPELINE_STATES,
        (candidate) => candidate.status === status,
      )
      .map((state) => this.clone(state));
  }

  async markInterrupted(): Promise<number> {
    const running = this.storage.list<PipelineState>(
      PIPELINE_STATES,
      (candidate) => candidate.status === "running",
    );
    if (running.length === 0) return 0;

    const now = Date.now();
    const mutations: DurableMutation[] = running.map((state) => {
      const interrupted = this.clone(state);
      interrupted.status = "failed";
      interrupted.finishedAt = now;
      interrupted.currentStage = null;

      for (const stage of interrupted.stages) {
        if (stage.status !== "running") continue;
        stage.status = "failed";
        stage.error = "Interrupted: server restart";
        stage.completedAt = now;
        if (!interrupted.failedStages.includes(stage.name)) {
          interrupted.failedStages.push(stage.name);
        }
      }

      return {
        operation: "set",
        collection: PIPELINE_STATES,
        id: interrupted.pipelineId,
        data: interrupted,
      };
    });

    await this.storage.applyDurableBatch(mutations);
    return mutations.length;
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

  return configuredStorageProvider;
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
