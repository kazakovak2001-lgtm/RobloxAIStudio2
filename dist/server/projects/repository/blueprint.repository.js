export class InMemoryBlueprintRepository {
    constructor() {
        this.blueprints = new Map();
        this.versions = new Map();
        this.executions = new Map();
    }
    async createBlueprint(userId, input) {
        const id = this.generateId();
        const blueprint = {
            ...input,
            id,
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: "draft",
            version: 1,
        };
        this.blueprints.set(id, blueprint);
        return blueprint;
    }
    async getBlueprint(id) {
        return this.blueprints.get(id) ?? null;
    }
    async getBlueprintByProjectId(projectId) {
        for (const blueprint of this.blueprints.values()) {
            if (blueprint.projectId === projectId) {
                return blueprint;
            }
        }
        return null;
    }
    async updateBlueprint(id, input) {
        const blueprint = this.blueprints.get(id);
        if (!blueprint)
            return null;
        const updated = {
            ...blueprint,
            ...input,
            updatedAt: new Date(),
        };
        this.blueprints.set(id, updated);
        return updated;
    }
    async deleteBlueprint(id) {
        return this.blueprints.delete(id);
    }
    async listBlueprints(options) {
        let items = Array.from(this.blueprints.values());
        if (options.projectId) {
            items = items.filter((b) => b.projectId === options.projectId);
        }
        if (options.userId) {
            items = items.filter((b) => b.userId === options.userId);
        }
        if (options.status) {
            items = items.filter((b) => b.status === options.status);
        }
        const sortBy = (options.sortBy ?? "createdAt");
        const sortOrder = options.sortOrder ?? "desc";
        items.sort((a, b) => {
            const aVal = String(a[sortBy] ?? "");
            const bVal = String(b[sortBy] ?? "");
            const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            return sortOrder === "asc" ? comparison : -comparison;
        });
        const offset = options.offset ?? 0;
        const limit = options.limit ?? 10;
        const paged = items.slice(offset, offset + limit);
        return { items: paged, total: items.length };
    }
    async saveVersion(blueprintId, userId, description) {
        const blueprint = this.blueprints.get(blueprintId);
        if (!blueprint)
            throw new Error(`Blueprint ${blueprintId} not found`);
        const versionNumber = blueprint.version;
        const version = {
            id: this.generateId(),
            blueprintId,
            versionNumber,
            createdAt: new Date(),
            createdBy: userId,
            snapshot: JSON.stringify(blueprint),
            changeDescription: description,
            isActive: true,
        };
        if (!this.versions.has(blueprintId)) {
            this.versions.set(blueprintId, []);
        }
        this.versions.get(blueprintId).push(version);
        return version;
    }
    async getVersion(blueprintId, versionNumber) {
        const versions = this.versions.get(blueprintId);
        return versions?.find((v) => v.versionNumber === versionNumber) ?? null;
    }
    async listVersions(blueprintId) {
        return this.versions.get(blueprintId) ?? [];
    }
    async restoreVersion(blueprintId, versionNumber) {
        const blueprint = this.blueprints.get(blueprintId);
        if (!blueprint)
            return null;
        const version = await this.getVersion(blueprintId, versionNumber);
        if (!version)
            return null;
        const snapshot = typeof version.snapshot === 'string' ? JSON.parse(version.snapshot) : version.snapshot;
        const restored = {
            ...blueprint,
            ...snapshot,
            version: versionNumber + 1,
            updatedAt: new Date(),
        };
        this.blueprints.set(blueprintId, restored);
        return restored;
    }
    async recordExecution(execution) {
        this.executions.set(execution.id, execution);
        return execution;
    }
    async getExecution(id) {
        return this.executions.get(id) ?? null;
    }
    async listExecutions(blueprintId) {
        return Array.from(this.executions.values()).filter((e) => e.blueprintId === blueprintId);
    }
    async updateExecution(id, updates) {
        const execution = this.executions.get(id);
        if (!execution)
            return null;
        const updated = { ...execution, ...updates };
        this.executions.set(id, updated);
        return updated;
    }
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}
