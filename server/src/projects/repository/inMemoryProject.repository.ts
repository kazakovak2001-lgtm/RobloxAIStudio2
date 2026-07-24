import type {
  IProjectRepository,
  Project,
  CreateProjectInput,
  ProjectQueryOptions,
  ProjectListResult,
} from "./project.repository";

export class InMemoryProjectRepository implements IProjectRepository {
  private projects = new Map<string, Project>();

  async create(input: CreateProjectInput): Promise<Project> {
    const id = `proj-${Date.now()}`;
    const project: Project = {
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

  async getById(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }

  async list(_options?: ProjectQueryOptions): Promise<ProjectListResult> {
    const items = Array.from(this.projects.values());
    return { items, total: items.length };
  }

  async update(id: string, updates: Partial<Project>): Promise<Project | null> {
    const project = this.projects.get(id);
    if (!project) return null;

    const updated = { ...project, ...updates, updatedAt: new Date() };
    this.projects.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }
}
