import type { IProjectRepository, Project, CreateProjectInput, ProjectQueryOptions } from "../repository/project.repository";
export declare class ProjectService {
    private repository;
    constructor(repository: IProjectRepository);
    create(input: CreateProjectInput): Promise<Project>;
    getById(id: string): Promise<Project | null>;
    list(options?: ProjectQueryOptions): Promise<Project[]>;
    update(id: string, updates: Partial<Project>): Promise<Project | null>;
    delete(id: string): Promise<boolean>;
}
