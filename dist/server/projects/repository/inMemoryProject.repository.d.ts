import type { IProjectRepository, Project, CreateProjectInput, ProjectQueryOptions, ProjectListResult } from "./project.repository";
export declare class InMemoryProjectRepository implements IProjectRepository {
    private projects;
    create(input: CreateProjectInput): Promise<Project>;
    getById(id: string): Promise<Project | null>;
    list(_options?: ProjectQueryOptions): Promise<ProjectListResult>;
    update(id: string, updates: Partial<Project>): Promise<Project | null>;
    delete(id: string): Promise<boolean>;
}
