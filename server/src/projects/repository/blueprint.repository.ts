import type {
  DurableMutation,
  StorageProvider,
} from "../../platform/storage/StorageProvider";
import { InMemoryStorageProvider } from "../../platform/storage/StorageProvider";
import { getConfiguredStorageProvider } from "../../platform/storage/StorageFactory";
import type {
  GameBlueprint,
  BlueprintVersion,
  GenerationExecution,
  CreateBlueprintInput,
  UpdateBlueprintInput,
  BlueprintQueryOptions,
} from "../types/blueprint";
import { StorageBlueprintRepository } from "./storageBlueprint.repository";

export interface IBlueprintRepository {
  createBlueprint(
    userId: string,
    input: CreateBlueprintInput,
  ): Promise<GameBlueprint>;
  getBlueprint(id: string): Promise<GameBlueprint | null>;
  getBlueprintByProjectId(projectId: string): Promise<GameBlueprint | null>;
  updateBlueprint(
    id: string,
    input: UpdateBlueprintInput,
  ): Promise<GameBlueprint | null>;
  deleteBlueprint(id: string): Promise<boolean>;
  listBlueprints(
    options: BlueprintQueryOptions,
  ): Promise<{ items: GameBlueprint[]; total: number }>;
  saveVersion(
    blueprintId: string,
    userId: string,
    description?: string,
  ): Promise<BlueprintVersion>;
  /**
   * BLUEPRINT-STALE-001. Build an immutable version snapshot and the durable
   * mutations that record it, without writing anything.
   *
   * `saveVersion` above writes on its own, which is right for an explicit
   * "save a version" action but wrong for generation start, where the snapshot
   * has to commit in the same transaction as the execution that references it.
   * A snapshot without its execution, or an execution referencing a snapshot
   * that never committed, are both states nothing could repair.
   */
  prepareVersion(
    blueprintId: string,
    userId: string,
    description?: string,
  ): Promise<{ version: BlueprintVersion; mutations: DurableMutation[] }>;
  getVersion(
    blueprintId: string,
    versionNumber: number,
  ): Promise<BlueprintVersion | null>;
  listVersions(blueprintId: string): Promise<BlueprintVersion[]>;
  restoreVersion(
    blueprintId: string,
    versionNumber: number,
  ): Promise<GameBlueprint | null>;
  recordExecution(execution: GenerationExecution): Promise<GenerationExecution>;
  getExecution(id: string): Promise<GenerationExecution | null>;
  listExecutions(blueprintId: string): Promise<GenerationExecution[]>;
  updateExecution(
    id: string,
    updates: Partial<GenerationExecution>,
  ): Promise<GenerationExecution | null>;
}

/**
 * Backward-compatible repository name used throughout the existing runtime.
 *
 * Application bootstrap creates one configured StorageProvider before this
 * class is instantiated. Isolated tests that do not bootstrap the application
 * retain an in-memory provider unless they inject one explicitly.
 */
export class InMemoryBlueprintRepository extends StorageBlueprintRepository {
  constructor(
    storage: StorageProvider = getConfiguredStorageProvider() ??
      new InMemoryStorageProvider(),
  ) {
    super(storage);
  }
}
