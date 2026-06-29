import { BlueprintValidator } from "./blueprint.validator";
export class GameGenerationService {
    constructor(repository, cache, streaming, _events) {
        this.repository = repository;
        this.cache = cache;
        this.streaming = streaming;
        this.validator = new BlueprintValidator();
    }
    async createBlueprint(userId, projectId, input) {
        const blueprint = await this.repository.createBlueprint(userId, input);
        this.cache.set(projectId, blueprint);
        return blueprint;
    }
    async getBlueprint(id) {
        return this.repository.getBlueprint(id);
    }
    async getBlueprintByProject(projectId) {
        const cached = this.cache.get(projectId);
        if (cached)
            return cached;
        return this.repository.getBlueprintByProjectId(projectId);
    }
    async updateBlueprint(id, updates) {
        const blueprint = await this.repository.updateBlueprint(id, updates);
        if (blueprint) {
            this.cache.set(blueprint.projectId, blueprint);
        }
        return blueprint;
    }
    validateBlueprint(blueprint) {
        return this.validator.validate(blueprint);
    }
    async startGeneration(blueprintId, userId) {
        const execution = {
            id: `exec-${Date.now()}`,
            blueprintId,
            projectId: "",
            userId,
            startedAt: new Date(),
            status: "running",
            retryCount: 0,
        };
        await this.repository.recordExecution(execution);
        return execution;
    }
    async getExecution(id) {
        return this.repository.getExecution(id);
    }
    async getExecutions(blueprintId) {
        return this.repository.listExecutions(blueprintId);
    }
    getStreamingHandler() {
        return this.streaming;
    }
    getCacheStats() {
        return this.cache.getStats();
    }
}
