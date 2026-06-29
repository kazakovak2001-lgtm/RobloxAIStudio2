export class InMemoryProjectRepository {
    constructor() {
        this.projects = new Map();
    }
    async create(input) {
        const id = `proj-${Date.now()}`;
        const project = {
            ...input,
            id,
            status: "draft",
            progress: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.projects.set(id, project);
        return project;
    }
    async getById(id) {
        return this.projects.get(id) ?? null;
    }
    async list(_options) {
        const items = Array.from(this.projects.values());
        return { items, total: items.length };
    }
    async update(id, updates) {
        const project = this.projects.get(id);
        if (!project)
            return null;
        const updated = { ...project, ...updates, updatedAt: new Date() };
        this.projects.set(id, updated);
        return updated;
    }
    async delete(id) {
        return this.projects.delete(id);
    }
}
