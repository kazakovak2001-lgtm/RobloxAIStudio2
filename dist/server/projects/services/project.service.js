export class ProjectService {
    constructor(repository) {
        this.repository = repository;
    }
    async create(input) {
        return this.repository.create(input);
    }
    async getById(id) {
        return this.repository.getById(id);
    }
    async list(options) {
        const result = await this.repository.list(options);
        return result.items;
    }
    async update(id, updates) {
        return this.repository.update(id, updates);
    }
    async delete(id) {
        return this.repository.delete(id);
    }
}
