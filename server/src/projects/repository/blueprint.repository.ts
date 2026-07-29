import { randomUUID } from "crypto";
import type { StorageProvider } from "../../platform/storage/StorageProvider";
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

const BLUEPRINTS = "game_blueprints";

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
 *
 * Blueprint create/update are request-facing single-record mutations, so this
 * production repository awaits durable acknowledgement before publishing the
 * new cache state. Multi-record version, execution and cascade-delete flows
 * remain delegated to the compatibility implementation until DATA-201C defines
 * their transaction and replay semantics.
 */
export class InMemoryBlueprintRepository extends StorageBlueprintRepository {
  constructor(
    private readonly acknowledgedStorage: StorageProvider = getConfiguredStorageProvider() ??
      new InMemoryStorageProvider(),
  ) {
    super(acknowledgedStorage);
  }

  override async createBlueprint(
    userId: string,
    input: CreateBlueprintInput,
  ): Promise<GameBlueprint> {
    const now = new Date();
    const blueprint = {
      ...input,
      id: `blueprint-${randomUUID()}`,
      user_id: userId,
      created_at: now,
      updated_at: now,
      status: "draft",
      version: 1,
    } as GameBlueprint;

    // The provider cache may change only after durable acknowledgement succeeds.
    await this.acknowledgedStorage.setDurable(
      BLUEPRINTS,
      blueprint.id,
      blueprint,
    );
    return blueprint;
  }

  override async updateBlueprint(
    id: string,
    input: UpdateBlueprintInput,
  ): Promise<GameBlueprint | null> {
    const existing = await this.getBlueprint(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...input,
      id: existing.id,
      user_id: existing.user_id,
      project_id: existing.project_id,
      created_at: existing.created_at,
      updated_at: new Date(),
    } as GameBlueprint;

    // The provider cache may change only after durable acknowledgement succeeds.
    await this.acknowledgedStorage.setDurable(BLUEPRINTS, id, updated);
    return updated;
  }
}
