/**
 * Pipeline Artifact Storage — stores outputs from each pipeline stage.
 */

import { randomUUID } from "crypto";
import {
  getConfiguredStorageProvider,
  type StorageProvider,
} from "../../platform/storage/StorageFactory";
import type { StageName } from "./PipelineStage";

export interface PipelineArtifact {
  id: string;
  pipelineId: string;
  stage: StageName;
  agent: string | null;
  type: ArtifactType;
  name: string;
  createdAt: number;
  content: unknown;
  sizeBytes: number;
  validated: boolean;
  reviewStatus: ReviewStatus;
  reviewComment?: string;
  reviewedAt?: number;
  reviewedBy?: string;
}

export type ReviewStatus = "pending" | "approved" | "rejected" | "edited";

export type ArtifactType =
  | "json"
  | "lua"
  | "markdown"
  | "text"
  | "manifest"
  | "ui-layout"
  | "asset-plan";

const ARTIFACT_COLLECTION = "pipeline_artifacts";

const STAGE_ARTIFACT_CONFIG: Record<
  StageName,
  { name: string; type: ArtifactType } | null
> = {
  REQUEST: { name: "request.json", type: "json" },
  REQUIREMENTS: { name: "requirements.json", type: "json" },
  GAME_DESIGN: { name: "gameConcept.json", type: "json" },
  ARCHITECTURE: { name: "architecture.json", type: "json" },
  ASSET_PLANNING: { name: "assetPlan.json", type: "asset-plan" },
  LUA_GENERATION: { name: "generatedScripts.lua", type: "lua" },
  UI_GENERATION: { name: "uiLayout.json", type: "ui-layout" },
  VALIDATION: { name: "validationReport.json", type: "json" },
  OPTIMIZATION: { name: "optimizationReport.json", type: "json" },
  DOCUMENTATION: { name: "documentation.md", type: "markdown" },
  EXPORT: { name: "exportManifest.json", type: "manifest" },
};

export class ArtifactStore {
  private artifacts: Map<string, PipelineArtifact> = new Map();
  private byPipeline: Map<string, string[]> = new Map();
  private readonly mutationQueues = new Map<string, Promise<void>>();

  constructor(private readonly injectedStorage?: StorageProvider) {}

  /**
   * Store an artifact produced by a pipeline stage after persistence is
   * acknowledged.
   */
  async store(
    pipelineId: string,
    stage: StageName,
    agent: string | null,
    content: unknown,
  ): Promise<PipelineArtifact> {
    const config = STAGE_ARTIFACT_CONFIG[stage];
    const artifactName = config?.name ?? `${stage.toLowerCase()}.json`;
    const artifactType = config?.type ?? "json";

    const serialized = JSON.stringify(content);
    const artifact: PipelineArtifact = {
      id: `artifact-${randomUUID().slice(0, 12)}`,
      pipelineId,
      stage,
      agent,
      type: artifactType,
      name: artifactName,
      createdAt: Date.now(),
      content,
      sizeBytes: Buffer.byteLength(serialized, "utf8"),
      validated: false,
      reviewStatus: "pending",
    };

    await this.persist(artifact);
    return artifact;
  }

  /**
   * Get all artifacts for a pipeline.
   */
  getByPipeline(pipelineId: string): PipelineArtifact[] {
    const storage = this.storage;
    if (storage) {
      const artifacts = storage
        .list<PipelineArtifact>(
          ARTIFACT_COLLECTION,
          (artifact) => artifact.pipelineId === pipelineId,
        )
        .sort((left, right) => left.createdAt - right.createdAt);
      artifacts.forEach((artifact) => this.cache(artifact));
      return artifacts;
    }

    const ids = this.byPipeline.get(pipelineId) ?? [];
    return ids
      .map((id) => this.artifacts.get(id))
      .filter(
        (artifact): artifact is PipelineArtifact => artifact !== undefined,
      );
  }

  /**
   * Get a single artifact by ID.
   */
  getById(artifactId: string): PipelineArtifact | null {
    const cached = this.artifacts.get(artifactId);
    if (cached) return cached;

    const artifact =
      this.storage?.get<PipelineArtifact>(ARTIFACT_COLLECTION, artifactId) ??
      null;
    if (artifact) this.cache(artifact);
    return artifact;
  }

  /**
   * Mark an artifact as validated after persistence acknowledgement.
   */
  async markValidated(artifactId: string): Promise<void> {
    await this.mutate(artifactId, (current) => ({
      ...current,
      validated: true,
    }));
  }

  /**
   * Get artifact count.
   */
  get count(): number {
    return this.storage?.count(ARTIFACT_COLLECTION) ?? this.artifacts.size;
  }

  /**
   * Approve an artifact after persistence acknowledgement.
   */
  approve(
    artifactId: string,
    reviewedBy: string,
  ): Promise<PipelineArtifact | null> {
    return this.mutate(artifactId, (current) => ({
      ...current,
      reviewStatus: "approved",
      reviewedAt: Date.now(),
      reviewedBy,
      validated: true,
    }));
  }

  /**
   * Reject an artifact after persistence acknowledgement.
   */
  reject(
    artifactId: string,
    reviewedBy: string,
    comment?: string,
  ): Promise<PipelineArtifact | null> {
    return this.mutate(artifactId, (current) => ({
      ...current,
      reviewStatus: "rejected",
      reviewedAt: Date.now(),
      reviewedBy,
      ...(comment ? { reviewComment: comment } : {}),
    }));
  }

  /**
   * Add a comment to an artifact after persistence acknowledgement.
   */
  comment(
    artifactId: string,
    reviewedBy: string,
    comment: string,
  ): Promise<PipelineArtifact | null> {
    return this.mutate(artifactId, (current) => ({
      ...current,
      reviewComment: comment,
      reviewedBy,
      reviewedAt: Date.now(),
    }));
  }

  /**
   * Update artifact content after persistence acknowledgement (marks as edited).
   */
  edit(
    artifactId: string,
    newContent: unknown,
    editedBy: string,
  ): Promise<PipelineArtifact | null> {
    return this.mutate(artifactId, (current) => ({
      ...current,
      content: newContent,
      sizeBytes: Buffer.byteLength(JSON.stringify(newContent), "utf8"),
      reviewStatus: "edited",
      reviewedAt: Date.now(),
      reviewedBy: editedBy,
    }));
  }

  /**
   * Get review summary for a pipeline.
   */
  getReviewSummary(pipelineId: string): ReviewSummary {
    const artifacts = this.getByPipeline(pipelineId);
    return {
      total: artifacts.length,
      approved: artifacts.filter((a) => a.reviewStatus === "approved").length,
      rejected: artifacts.filter((a) => a.reviewStatus === "rejected").length,
      edited: artifacts.filter((a) => a.reviewStatus === "edited").length,
      pending: artifacts.filter((a) => a.reviewStatus === "pending").length,
      allApproved: artifacts.every(
        (a) => a.reviewStatus === "approved" || a.reviewStatus === "edited",
      ),
    };
  }

  private get storage(): StorageProvider | undefined {
    return this.injectedStorage ?? getConfiguredStorageProvider() ?? undefined;
  }

  private async mutate(
    artifactId: string,
    build: (current: PipelineArtifact) => PipelineArtifact,
  ): Promise<PipelineArtifact | null> {
    const previous = this.mutationQueues.get(artifactId) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const current = this.getById(artifactId);
        if (!current) return null;

        const artifact = build(current);
        await this.persist(artifact);
        return artifact;
      });
    const tracked = operation.then(
      () => undefined,
      () => undefined,
    );
    this.mutationQueues.set(artifactId, tracked);

    try {
      return await operation;
    } finally {
      if (this.mutationQueues.get(artifactId) === tracked) {
        this.mutationQueues.delete(artifactId);
      }
    }
  }

  private async persist(artifact: PipelineArtifact): Promise<void> {
    const storage = this.storage;
    if (storage) {
      await storage.setDurable(ARTIFACT_COLLECTION, artifact.id, artifact);
    }
    this.cache(artifact);
  }

  private cache(artifact: PipelineArtifact): void {
    this.artifacts.set(artifact.id, artifact);
    const pipelineArtifacts = this.byPipeline.get(artifact.pipelineId) ?? [];
    if (!pipelineArtifacts.includes(artifact.id)) {
      pipelineArtifacts.push(artifact.id);
      this.byPipeline.set(artifact.pipelineId, pipelineArtifacts);
    }
  }
}

export interface ReviewSummary {
  total: number;
  approved: number;
  rejected: number;
  edited: number;
  pending: number;
  allApproved: boolean;
}
