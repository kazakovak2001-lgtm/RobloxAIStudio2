/**
 * VersionHistory — Project version tracking and rollback support.
 */

import { randomUUID } from "crypto";

export interface ProjectVersion {
  id: string;
  projectId: string;
  version: number;
  label: string;
  createdAt: number;
  pipelineId?: string;
  scriptCount: number;
  assetCount: number;
  qualityScore: number;
  snapshot: Record<string, unknown>;
}

export class VersionHistoryRepository {
  private versions: Map<string, ProjectVersion[]> = new Map();

  save(
    projectId: string,
    data: Omit<ProjectVersion, "id" | "version" | "createdAt">,
  ): ProjectVersion {
    const history = this.versions.get(projectId) ?? [];
    const version: ProjectVersion = {
      ...data,
      id: `ver-${randomUUID().slice(0, 8)}`,
      projectId,
      version: history.length + 1,
      createdAt: Date.now(),
    };
    history.push(version);
    this.versions.set(projectId, history);
    return version;
  }

  getHistory(projectId: string): ProjectVersion[] {
    return (this.versions.get(projectId) ?? []).sort(
      (a, b) => b.version - a.version,
    );
  }

  getVersion(projectId: string, version: number): ProjectVersion | null {
    const history = this.versions.get(projectId) ?? [];
    return history.find((v) => v.version === version) ?? null;
  }

  getLatest(projectId: string): ProjectVersion | null {
    const history = this.versions.get(projectId) ?? [];
    return history.length > 0 ? history[history.length - 1] : null;
  }

  getCount(projectId: string): number {
    return (this.versions.get(projectId) ?? []).length;
  }
}
