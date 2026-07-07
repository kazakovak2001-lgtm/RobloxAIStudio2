/**
 * ArtifactIndex.ts — Indexes and retrieves generated artifact metadata.
 */

import type { ArtifactMetadata } from "./types";

export class ArtifactIndex {
  private index: Map<string, ArtifactMetadata> = new Map();

  add(artifact: ArtifactMetadata): void {
    this.index.set(artifact.id, artifact);
  }

  get(id: string): ArtifactMetadata | undefined {
    return this.index.get(id);
  }
  getByPath(path: string): ArtifactMetadata | undefined {
    return [...this.index.values()].find((a) => a.path === path);
  }
  getByProject(projectId: string): ArtifactMetadata[] {
    return [...this.index.values()].filter((a) => a.projectId === projectId);
  }
  getByType(type: ArtifactMetadata["artifactType"]): ArtifactMetadata[] {
    return [...this.index.values()].filter((a) => a.artifactType === type);
  }
  getByTags(tags: string[]): ArtifactMetadata[] {
    return [...this.index.values()].filter((a) =>
      tags.some((t) => a.tags.includes(t)),
    );
  }
  search(query: string): ArtifactMetadata[] {
    const q = query.toLowerCase();
    return [...this.index.values()].filter(
      (a) =>
        a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q),
    );
  }
  getAll(): ArtifactMetadata[] {
    return [...this.index.values()];
  }
  has(id: string): boolean {
    return this.index.has(id);
  }
  delete(id: string): boolean {
    return this.index.delete(id);
  }
  get size(): number {
    return this.index.size;
  }
  clear(): void {
    this.index.clear();
  }
}
