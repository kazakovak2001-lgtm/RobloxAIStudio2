/**
 * SaaSProjectRepository — Multi-user project management with ownership isolation.
 */

import { randomUUID } from "crypto";
import type { StorageProvider } from "../storage/StorageProvider";

export interface SaaSProject {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  genre: string;
  status:
    "draft" | "generating" | "testing" | "ready" | "published" | "archived";
  qualityScore: number;
  generationCount: number;
  scriptCount: number;
  assetCount: number;
  createdAt: number;
  updatedAt: number;
}

export class SaaSProjectRepository {
  private storage: StorageProvider;
  private collection = "projects";

  constructor(storage: StorageProvider) {
    this.storage = storage;
  }

  create(
    ownerId: string,
    name: string,
    genre: string,
    description = "",
  ): SaaSProject {
    const project: SaaSProject = {
      id: `proj-${randomUUID().slice(0, 10)}`,
      ownerId,
      name,
      description,
      genre,
      status: "draft",
      qualityScore: 0,
      generationCount: 0,
      scriptCount: 0,
      assetCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.storage.set(this.collection, project.id, project);
    return project;
  }

  get(projectId: string): SaaSProject | null {
    return this.storage.get<SaaSProject>(this.collection, projectId);
  }

  getByOwner(ownerId: string): SaaSProject[] {
    return this.storage.list<SaaSProject>(
      this.collection,
      (p) => p.ownerId === ownerId,
    );
  }

  update(projectId: string, updates: Partial<SaaSProject>): SaaSProject | null {
    const existing = this.get(projectId);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    this.storage.set(this.collection, projectId, updated);
    return updated;
  }

  delete(projectId: string): boolean {
    return this.storage.delete(this.collection, projectId);
  }

  duplicate(projectId: string, newOwnerId?: string): SaaSProject | null {
    const existing = this.get(projectId);
    if (!existing) return null;
    return this.create(
      newOwnerId ?? existing.ownerId,
      `${existing.name} (copy)`,
      existing.genre,
      existing.description,
    );
  }

  /** Verify ownership — User A cannot access User B projects */
  verifyOwnership(projectId: string, userId: string): boolean {
    const project = this.get(projectId);
    return project?.ownerId === userId;
  }
}
