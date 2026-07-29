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
  gameType?: string;
  genre: string;
  difficulty?: string;
  players?: string;
  targetAudience?: string;
  coverUrl?: string;
  status:
    | "draft"
    | "generating"
    | "testing"
    | "ready"
    | "published"
    | "archived";
  qualityScore: number;
  generationCount: number;
  scriptCount: number;
  assetCount: number;
  createdAt: number;
  updatedAt: number;
}

export type SaaSProjectUpdate = Partial<
  Omit<SaaSProject, "id" | "ownerId" | "createdAt" | "updatedAt">
>;

export class SaaSProjectRepository {
  private storage: StorageProvider;
  private collection = "projects";

  constructor(storage: StorageProvider) {
    this.storage = storage;
  }

  /** Request-safe create that resolves only after storage acknowledgement. */
  async createDurable(
    ownerId: string,
    name: string,
    genre: string,
    description = "",
    initial: SaaSProjectUpdate = {},
  ): Promise<SaaSProject> {
    const project = this.buildProject(
      ownerId,
      name,
      genre,
      description,
      initial,
    );
    await this.storage.setDurable(this.collection, project.id, project);
    return project;
  }

  get(projectId: string): SaaSProject | null {
    return this.storage.get<SaaSProject>(this.collection, projectId);
  }

  getByOwner(ownerId: string): SaaSProject[] {
    return this.storage.list<SaaSProject>(
      this.collection,
      (project) => project.ownerId === ownerId,
    );
  }

  /** Lifecycle-safe update that publishes state only after acknowledgement. */
  async updateDurable(
    projectId: string,
    updates: SaaSProjectUpdate,
  ): Promise<SaaSProject | null> {
    const existing = this.get(projectId);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    await this.storage.setDurable(this.collection, projectId, updated);
    return updated;
  }

  /** Request-safe delete that preserves cache state on rejection. */
  async deleteDurable(projectId: string): Promise<boolean> {
    return this.storage.deleteDurable(this.collection, projectId);
  }

  async duplicate(
    projectId: string,
    newOwnerId?: string,
  ): Promise<SaaSProject | null> {
    const existing = this.get(projectId);
    if (!existing) return null;
    return this.createDurable(
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

  private buildProject(
    ownerId: string,
    name: string,
    genre: string,
    description: string,
    initial: SaaSProjectUpdate = {},
  ): SaaSProject {
    const now = Date.now();
    return {
      id: `proj-${randomUUID().slice(0, 10)}`,
      ownerId,
      name,
      description,
      genre,
      ...initial,
      status: "draft",
      qualityScore: 0,
      generationCount: 0,
      scriptCount: 0,
      assetCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
}
