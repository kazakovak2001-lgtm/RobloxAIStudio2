import type {
  GameBlueprint,
  BlueprintVersion,
  GenerationExecution,
  CreateBlueprintInput,
  UpdateBlueprintInput,
  BlueprintQueryOptions,
} from "../types/blueprint";

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

export class InMemoryBlueprintRepository implements IBlueprintRepository {
  private blueprints = new Map<string, GameBlueprint>();
  private versions = new Map<string, BlueprintVersion[]>();
  private executions = new Map<string, GenerationExecution>();

  async createBlueprint(
    userId: string,
    input: CreateBlueprintInput,
  ): Promise<GameBlueprint> {
    const id = this.generateId();
    const now = new Date();
    const blueprint: GameBlueprint = {
      ...input,
      id,
      user_id: userId,
      created_at: now,
      updated_at: now,
      status: "draft",
      version: 1,
    } as GameBlueprint;
    this.blueprints.set(id, blueprint);
    return blueprint;
  }

  async getBlueprint(id: string): Promise<GameBlueprint | null> {
    return this.blueprints.get(id) ?? null;
  }

  async getBlueprintByProjectId(
    projectId: string,
  ): Promise<GameBlueprint | null> {
    for (const blueprint of this.blueprints.values()) {
      if (blueprint.project_id === projectId) {
        return blueprint;
      }
    }
    return null;
  }

  async updateBlueprint(
    id: string,
    input: UpdateBlueprintInput,
  ): Promise<GameBlueprint | null> {
    const blueprint = this.blueprints.get(id);
    if (!blueprint) return null;

    const updated: GameBlueprint = {
      ...blueprint,
      ...(input as Partial<GameBlueprint>),
      updated_at: new Date(),
    };
    this.blueprints.set(id, updated);
    return updated;
  }

  async deleteBlueprint(id: string): Promise<boolean> {
    return this.blueprints.delete(id);
  }

  async listBlueprints(options: BlueprintQueryOptions) {
    let items = Array.from(this.blueprints.values());

    if (options.project_id) {
      items = items.filter((b) => b.project_id === options.project_id);
    }
    if (options.user_id) {
      items = items.filter((b) => b.user_id === options.user_id);
    }
    if (options.status) {
      items = items.filter((b) => b.status === options.status);
    }

    const sortBy = (options.sort_by ?? "created_at") as keyof GameBlueprint;
    const sortOrder = options.sort_order ?? "desc";
    items.sort((a, b) => {
      const aVal = String(a[sortBy] ?? "");
      const bVal = String(b[sortBy] ?? "");
      const comparison = aVal.localeCompare(bVal);
      return sortOrder === "asc" ? comparison : -comparison;
    });

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 10;
    const paged = items.slice(offset, offset + limit);

    return { items: paged, total: items.length };
  }

  async saveVersion(
    blueprintId: string,
    userId: string,
    description?: string,
  ): Promise<BlueprintVersion> {
    const blueprint = this.blueprints.get(blueprintId);
    if (!blueprint) throw new Error(`Blueprint ${blueprintId} not found`);

    const version: BlueprintVersion = {
      id: this.generateId(),
      blueprint_id: blueprintId,
      version_number: blueprint.version,
      created_at: new Date(),
      created_by: userId,
      snapshot: { ...blueprint },
      change_description: description,
      is_active: true,
    };

    if (!this.versions.has(blueprintId)) {
      this.versions.set(blueprintId, []);
    }
    this.versions.get(blueprintId)!.push(version);
    return version;
  }

  async getVersion(
    blueprintId: string,
    versionNumber: number,
  ): Promise<BlueprintVersion | null> {
    const versions = this.versions.get(blueprintId);
    return versions?.find((v) => v.version_number === versionNumber) ?? null;
  }

  async listVersions(blueprintId: string): Promise<BlueprintVersion[]> {
    return this.versions.get(blueprintId) ?? [];
  }

  async restoreVersion(
    blueprintId: string,
    versionNumber: number,
  ): Promise<GameBlueprint | null> {
    const blueprint = this.blueprints.get(blueprintId);
    if (!blueprint) return null;

    const version = await this.getVersion(blueprintId, versionNumber);
    if (!version) return null;

    const restored: GameBlueprint = {
      ...blueprint,
      ...(version.snapshot as Partial<GameBlueprint>),
      version: versionNumber + 1,
      updated_at: new Date(),
    };
    this.blueprints.set(blueprintId, restored);
    return restored;
  }

  async recordExecution(
    execution: GenerationExecution,
  ): Promise<GenerationExecution> {
    this.executions.set(execution.id, execution);
    return execution;
  }

  async getExecution(id: string): Promise<GenerationExecution | null> {
    return this.executions.get(id) ?? null;
  }

  async listExecutions(blueprintId: string): Promise<GenerationExecution[]> {
    return Array.from(this.executions.values()).filter(
      (e) => e.blueprint_id === blueprintId,
    );
  }

  async updateExecution(
    id: string,
    updates: Partial<GenerationExecution>,
  ): Promise<GenerationExecution | null> {
    const execution = this.executions.get(id);
    if (!execution) return null;

    const updated: GenerationExecution = { ...execution, ...updates };
    this.executions.set(id, updated);
    return updated;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
