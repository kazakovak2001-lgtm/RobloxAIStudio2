/**
 * ProjectRegistry.ts
 *
 * Central registry of all compiler projects.
 * Each project gets an isolated compiler context with independent
 * assemblies, governance, telemetry, and storage.
 */

export interface ProjectConfig {
  name: string;
  description?: string;
  storageRoot?: string;
}

export type ProjectStatus = "active" | "archived" | "disabled";

export interface Project {
  projectId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  status: ProjectStatus;
  storageRoot: string;
  telemetryScope: string;
}

export class ProjectRegistry {
  private projects = new Map<string, Project>();
  private counter = 0;

  /**
   * Create a new project with an isolated context.
   */
  createProject(config: ProjectConfig): Project {
    this.counter++;
    const projectId = `proj-${Date.now()}-${this.counter}`;
    const project: Project = {
      projectId,
      name: config.name,
      description: config.description,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "active",
      storageRoot: config.storageRoot ?? `storage/projects/${projectId}`,
      telemetryScope: `project:${projectId}`,
    };
    this.projects.set(projectId, project);
    console.log(`[PROJECT] Created | ID: ${projectId} | Name: ${config.name}`);
    return project;
  }

  getProject(projectId: string): Project | null {
    return this.projects.get(projectId) ?? null;
  }

  listProjects(): Project[] {
    return Array.from(this.projects.values());
  }

  listActive(): Project[] {
    return this.listProjects().filter((p) => p.status === "active");
  }

  updateProject(
    projectId: string,
    updates: Partial<Pick<Project, "name" | "description" | "status">>,
  ): Project | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    if (updates.name !== undefined) project.name = updates.name;
    if (updates.description !== undefined)
      project.description = updates.description;
    if (updates.status !== undefined) project.status = updates.status;
    project.updatedAt = new Date();
    return project;
  }

  deleteProject(projectId: string): boolean {
    const deleted = this.projects.delete(projectId);
    if (deleted) {
      console.log(`[PROJECT] Deleted | ID: ${projectId}`);
    }
    return deleted;
  }

  hasProject(projectId: string): boolean {
    return this.projects.has(projectId);
  }

  get size(): number {
    return this.projects.size;
  }
}

let _instance: ProjectRegistry | null = null;
export function getProjectRegistry(): ProjectRegistry {
  if (!_instance) _instance = new ProjectRegistry();
  return _instance;
}
