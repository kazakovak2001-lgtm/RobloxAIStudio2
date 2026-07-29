import { randomUUID } from "crypto";
import type { StorageProvider } from "../../platform/storage/StorageProvider";
import type {
  BlueprintQueryOptions,
  BlueprintVersion,
  CreateBlueprintInput,
  GameBlueprint,
  GenerationExecution,
  UpdateBlueprintInput,
} from "../types/blueprint";
import type { IBlueprintRepository } from "./blueprint.repository";

const BLUEPRINTS = "game_blueprints";
const VERSIONS = "blueprint_versions";
const EXECUTIONS = "generation_executions";

/**
 * Durable blueprint repository backed by the process-wide StorageProvider.
 *
 * PostgreSQL stores records as JSON, so every read rehydrates Date fields to
 * preserve the existing repository contract across provider restarts.
 */
export class StorageBlueprintRepository implements IBlueprintRepository {
  constructor(private readonly storage: StorageProvider) {}

  async createBlueprint(
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

    await this.storage.setDurable(BLUEPRINTS, blueprint.id, blueprint);
    return this.hydrateBlueprint(blueprint);
  }

  async getBlueprint(id: string): Promise<GameBlueprint | null> {
    const blueprint = this.storage.get<GameBlueprint>(BLUEPRINTS, id);
    return blueprint ? this.hydrateBlueprint(blueprint) : null;
  }

  async getBlueprintByProjectId(
    projectId: string,
  ): Promise<GameBlueprint | null> {
    const blueprint = this.storage
      .list<GameBlueprint>(
        BLUEPRINTS,
        (candidate) => candidate.project_id === projectId,
      )
      .sort(
        (left, right) =>
          this.asTimestamp(right.updated_at) -
          this.asTimestamp(left.updated_at),
      )[0];

    return blueprint ? this.hydrateBlueprint(blueprint) : null;
  }

  async updateBlueprint(
    id: string,
    input: UpdateBlueprintInput,
  ): Promise<GameBlueprint | null> {
    const existing = await this.getBlueprint(id);
    if (!existing) return null;

    const updated = this.hydrateBlueprint({
      ...existing,
      ...(input as Partial<GameBlueprint>),
      id: existing.id,
      user_id: existing.user_id,
      project_id: existing.project_id,
      created_at: existing.created_at,
      updated_at: new Date(),
    });
    await this.storage.setDurable(BLUEPRINTS, id, updated);
    return updated;
  }

  async deleteBlueprint(id: string): Promise<boolean> {
    const deleted = this.storage.delete(BLUEPRINTS, id);
    if (!deleted) return false;

    for (const version of this.storage.list<BlueprintVersion>(
      VERSIONS,
      (candidate) => candidate.blueprint_id === id,
    )) {
      this.storage.delete(VERSIONS, version.id);
    }
    for (const execution of this.storage.list<GenerationExecution>(
      EXECUTIONS,
      (candidate) => candidate.blueprint_id === id,
    )) {
      this.storage.delete(EXECUTIONS, execution.id);
    }
    return true;
  }

  async listBlueprints(
    options: BlueprintQueryOptions,
  ): Promise<{ items: GameBlueprint[]; total: number }> {
    let items = this.storage
      .list<GameBlueprint>(BLUEPRINTS)
      .map((blueprint) => this.hydrateBlueprint(blueprint));

    if (options.project_id) {
      items = items.filter(
        (blueprint) => blueprint.project_id === options.project_id,
      );
    }
    if (options.user_id) {
      items = items.filter(
        (blueprint) => blueprint.user_id === options.user_id,
      );
    }
    if (options.status) {
      items = items.filter((blueprint) => blueprint.status === options.status);
    }

    const sortBy = options.sort_by ?? "created_at";
    const direction = options.sort_order === "asc" ? 1 : -1;
    items.sort((left, right) => {
      const leftValue =
        sortBy === "status" ? left.status : this.asTimestamp(left[sortBy]);
      const rightValue =
        sortBy === "status" ? right.status : this.asTimestamp(right[sortBy]);
      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return 1 * direction;
      return 0;
    });

    const total = items.length;
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.max(1, options.limit ?? 10);
    return { items: items.slice(offset, offset + limit), total };
  }

  async saveVersion(
    blueprintId: string,
    userId: string,
    description?: string,
  ): Promise<BlueprintVersion> {
    const blueprint = await this.getBlueprint(blueprintId);
    if (!blueprint) throw new Error(`Blueprint ${blueprintId} not found`);

    const version: BlueprintVersion = {
      id: `blueprint-version-${randomUUID()}`,
      blueprint_id: blueprintId,
      version_number: blueprint.version,
      created_at: new Date(),
      created_by: userId,
      snapshot: { ...blueprint },
      change_description: description,
      is_active: true,
    };
    await this.storage.setDurable(VERSIONS, version.id, version);
    return this.hydrateVersion(version);
  }

  async getVersion(
    blueprintId: string,
    versionNumber: number,
  ): Promise<BlueprintVersion | null> {
    const version = this.storage
      .list<BlueprintVersion>(
        VERSIONS,
        (candidate) =>
          candidate.blueprint_id === blueprintId &&
          candidate.version_number === versionNumber,
      )
      .sort(
        (left, right) =>
          this.asTimestamp(right.created_at) -
          this.asTimestamp(left.created_at),
      )[0];
    return version ? this.hydrateVersion(version) : null;
  }

  async listVersions(blueprintId: string): Promise<BlueprintVersion[]> {
    return this.storage
      .list<BlueprintVersion>(
        VERSIONS,
        (candidate) => candidate.blueprint_id === blueprintId,
      )
      .map((version) => this.hydrateVersion(version))
      .sort((left, right) => left.version_number - right.version_number);
  }

  async restoreVersion(
    blueprintId: string,
    versionNumber: number,
  ): Promise<GameBlueprint | null> {
    const blueprint = await this.getBlueprint(blueprintId);
    const version = await this.getVersion(blueprintId, versionNumber);
    if (!blueprint || !version) return null;

    const restored = this.hydrateBlueprint({
      ...blueprint,
      ...version.snapshot,
      id: blueprint.id,
      project_id: blueprint.project_id,
      user_id: blueprint.user_id,
      created_at: blueprint.created_at,
      updated_at: new Date(),
      version: Math.max(blueprint.version, versionNumber) + 1,
    } as GameBlueprint);
    await this.storage.setDurable(BLUEPRINTS, blueprintId, restored);
    return restored;
  }

  async recordExecution(
    execution: GenerationExecution,
  ): Promise<GenerationExecution> {
    const hydrated = this.hydrateExecution(execution);
    await this.storage.setDurable(EXECUTIONS, execution.id, hydrated);
    return hydrated;
  }

  async getExecution(id: string): Promise<GenerationExecution | null> {
    const execution = this.storage.get<GenerationExecution>(EXECUTIONS, id);
    return execution ? this.hydrateExecution(execution) : null;
  }

  async listExecutions(blueprintId: string): Promise<GenerationExecution[]> {
    return this.storage
      .list<GenerationExecution>(
        EXECUTIONS,
        (candidate) => candidate.blueprint_id === blueprintId,
      )
      .map((execution) => this.hydrateExecution(execution))
      .sort(
        (left, right) => right.started_at.getTime() - left.started_at.getTime(),
      );
  }

  async updateExecution(
    id: string,
    updates: Partial<GenerationExecution>,
  ): Promise<GenerationExecution | null> {
    const existing = await this.getExecution(id);
    if (!existing) return null;

    const updated = this.hydrateExecution({
      ...existing,
      ...updates,
      id: existing.id,
      blueprint_id: existing.blueprint_id,
      project_id: existing.project_id,
      user_id: existing.user_id,
      started_at: existing.started_at,
    });
    await this.storage.setDurable(EXECUTIONS, id, updated);
    return updated;
  }

  private hydrateBlueprint(blueprint: GameBlueprint): GameBlueprint {
    return {
      ...blueprint,
      created_at: this.asDate(blueprint.created_at),
      updated_at: this.asDate(blueprint.updated_at),
      generation_metadata: blueprint.generation_metadata
        ? {
            ...blueprint.generation_metadata,
            generated_at: blueprint.generation_metadata.generated_at
              ? this.asDate(blueprint.generation_metadata.generated_at)
              : undefined,
          }
        : undefined,
      export_metadata: blueprint.export_metadata
        ? {
            ...blueprint.export_metadata,
            exported_at: blueprint.export_metadata.exported_at
              ? this.asDate(blueprint.export_metadata.exported_at)
              : undefined,
          }
        : undefined,
    };
  }

  private hydrateVersion(version: BlueprintVersion): BlueprintVersion {
    return {
      ...version,
      created_at: this.asDate(version.created_at),
      snapshot: this.hydrateBlueprintSnapshot(version.snapshot),
    };
  }

  private hydrateBlueprintSnapshot(
    snapshot: Partial<GameBlueprint>,
  ): Partial<GameBlueprint> {
    return {
      ...snapshot,
      created_at: snapshot.created_at
        ? this.asDate(snapshot.created_at)
        : undefined,
      updated_at: snapshot.updated_at
        ? this.asDate(snapshot.updated_at)
        : undefined,
      generation_metadata: snapshot.generation_metadata
        ? {
            ...snapshot.generation_metadata,
            generated_at: snapshot.generation_metadata.generated_at
              ? this.asDate(snapshot.generation_metadata.generated_at)
              : undefined,
          }
        : undefined,
      export_metadata: snapshot.export_metadata
        ? {
            ...snapshot.export_metadata,
            exported_at: snapshot.export_metadata.exported_at
              ? this.asDate(snapshot.export_metadata.exported_at)
              : undefined,
          }
        : undefined,
    };
  }

  private hydrateExecution(
    execution: GenerationExecution,
  ): GenerationExecution {
    return {
      ...execution,
      started_at: this.asDate(execution.started_at),
      completed_at: execution.completed_at
        ? this.asDate(execution.completed_at)
        : undefined,
      pipeline_steps: execution.pipeline_steps.map((step) => ({
        ...step,
        started_at: step.started_at ? this.asDate(step.started_at) : undefined,
        completed_at: step.completed_at
          ? this.asDate(step.completed_at)
          : undefined,
      })),
    };
  }

  private asTimestamp(value: unknown): number {
    if (value instanceof Date) return value.getTime();
    const timestamp = new Date(String(value)).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private asDate(value: unknown): Date {
    if (value instanceof Date) return new Date(value.getTime());
    return new Date(String(value));
  }
}
