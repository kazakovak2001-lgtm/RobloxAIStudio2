import type {
  IProjectRepository,
  Project,
  CreateProjectInput,
  ProjectQueryOptions,
} from "../repository/project.repository";

export class ProjectService {
  constructor(private repository: IProjectRepository) {}

  async create(input: CreateProjectInput): Promise<Project> {
    return this.repository.create(input);
  }

  async getById(id: string): Promise<Project | null> {
    return this.repository.getById(id);
  }

  async list(options?: ProjectQueryOptions): Promise<Project[]> {
    const result = await this.repository.list(options);
    return result.items;
  }

  async update(id: string, updates: Partial<Project>): Promise<Project | null> {
    return this.repository.update(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }
}
