/**
 * Pipeline Artifact Storage — stores outputs from each pipeline stage.
 */

import { randomUUID } from "crypto";
import type { StageName } from "./PipelineStage";
import {
  ARTIFACT_ENVELOPE_SCHEMA_VERSION,
  ArtifactContentError,
  computeContentHash,
  humanEditProducer,
  resolveProducer,
  validateArtifactEnvelope,
  type ArtifactDependency,
  type ArtifactProducer,
} from "./artifactEnvelope";

export interface ArtifactStorageProvider {
  get<T>(collection: string, id: string): T | null;
  list<T>(collection: string, filter?: (item: T) => boolean): T[];
  count(collection: string): number;
  setDurable<T>(collection: string, id: string, data: T): Promise<void>;
}

export type ArtifactStorageFactory = () => ArtifactStorageProvider;

let configuredArtifactStorageFactory: ArtifactStorageFactory | null = null;

export function configureArtifactStorageFactory(
  factory: ArtifactStorageFactory,
): void {
  configuredArtifactStorageFactory = factory;
}

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

  // ── ARTIFACT-CONTRACT-2 envelope ──────────────────────────────────────────
  // Optional on the type, and only because artifacts written before this slice
  // exist and must stay readable. Every new artifact carries all of them; the
  // store refuses to write one that does not.
  /** Envelope version, not payload version. Absent on historical artifacts. */
  schemaVersion?: number;
  /** Owning project, from server-held execution context. */
  projectId?: string;
  /** `sha256:<hex>` over the canonical serialization of `content`. */
  contentHash?: string;
  /** Who produced this content, recorded at creation and never re-resolved. */
  producer?: ArtifactProducer;
  /** Upstream artifacts this content was derived from, bound by hash. */
  dependencies?: readonly ArtifactDependency[];
}

/**
 * Server-held context a new artifact is written under.
 *
 * `projectId` is required and comes from the execution the server already
 * resolved. It is never taken from artifact content, and never from a request.
 */
export interface ArtifactWriteContext {
  readonly projectId: string;
  /**
   * Required whenever `agent` does not name a defined agent — `agent: null` is
   * shared by every deterministic stage, so it cannot identify a producer.
   *
   * A string names a registered deterministic producer, which lets a caller in
   * a layer that must not import the envelope module identify itself.
   */
  readonly producer?: ArtifactProducer | string;
  readonly dependencies?: readonly ArtifactDependency[];
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
  WORLD_MODEL: { name: "worldModel.json", type: "json" },
  VALIDATION: { name: "validationReport.json", type: "json" },
  SECURITY_REVIEW: { name: "securityReport.json", type: "json" },
  OPTIMIZATION: { name: "optimizationReport.json", type: "json" },
  DOCUMENTATION: { name: "documentation.md", type: "markdown" },
  EXPORT: { name: "exportManifest.json", type: "manifest" },
};

export class ArtifactStore {
  private artifacts: Map<string, PipelineArtifact> = new Map();
  private byPipeline: Map<string, string[]> = new Map();
  private readonly mutationQueues = new Map<string, Promise<void>>();

  constructor(private readonly injectedStorage?: ArtifactStorageProvider) {}

  /**
   * Store an artifact produced by a pipeline stage after persistence is
   * acknowledged.
   */
  async store(
    pipelineId: string,
    stage: StageName,
    agent: string | null,
    content: unknown,
    context: ArtifactWriteContext,
  ): Promise<PipelineArtifact> {
    const config = STAGE_ARTIFACT_CONFIG[stage];
    const artifactName = config?.name ?? `${stage.toLowerCase()}.json`;
    const artifactType = config?.type ?? "json";

    if (!context?.projectId) {
      throw new ArtifactContentError(
        `Artifact for stage ${stage} must be written with an owning project`,
      );
    }

    // ARTIFACT-CONTRACT-2. Hashed once, here, from the content as given.
    // Nothing downstream recomputes it in a loop, and nothing after this point
    // may change `content` without changing the hash with it.
    const artifact: PipelineArtifact = {
      id: `artifact-${randomUUID().slice(0, 12)}`,
      pipelineId,
      stage,
      agent,
      type: artifactType,
      name: artifactName,
      createdAt: Date.now(),
      content,
      sizeBytes: Buffer.byteLength(JSON.stringify(content) ?? "", "utf8"),
      validated: false,
      reviewStatus: "pending",
      schemaVersion: ARTIFACT_ENVELOPE_SCHEMA_VERSION,
      projectId: context.projectId,
      contentHash: computeContentHash(content),
      producer: resolveProducer(agent, context.producer),
      ...(context.dependencies?.length
        ? { dependencies: context.dependencies }
        : {}),
    };

    // Fail on write rather than leaving a malformed envelope to be discovered
    // by whatever reads it next. A lineage edge that does not hold is worse
    // than no edge, because it reads as verified provenance.
    const issues = validateArtifactEnvelope(artifact, (id) => {
      const upstream = this.getById(id);
      return upstream
        ? {
            id: upstream.id,
            stage: upstream.stage,
            projectId: upstream.projectId,
            contentHash: upstream.contentHash,
            reviewStatus: upstream.reviewStatus,
          }
        : null;
    });
    if (issues.length > 0) {
      throw new ArtifactContentError(
        `Refusing to store ${stage} artifact: ${issues.map((issue) => issue.message).join("; ")}`,
      );
    }

    await this.persist(artifact);
    return artifact;
  }

  /** A dependency reference to an artifact this store already committed. */
  static dependencyOn(artifact: PipelineArtifact): ArtifactDependency {
    if (!artifact.contentHash) {
      throw new ArtifactContentError(
        `Artifact "${artifact.id}" has no content hash, so nothing can bind to its exact content`,
      );
    }
    return {
      artifactId: artifact.id,
      stage: artifact.stage,
      contentHash: artifact.contentHash,
    };
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
      sizeBytes: Buffer.byteLength(JSON.stringify(newContent) ?? "", "utf8"),
      // The hash follows the content, always. An edited artifact is a
      // different thing, and anything that bound to the old bytes must be able
      // to tell — silently keeping the old hash would make a stale dependency
      // read as current.
      //
      // Provenance follows it too: the edited bytes are the reviewer's, not
      // the original producer's, so keeping that producer would attribute a
      // person's content to an agent or to a deterministic service.
      ...(current.schemaVersion === undefined
        ? {}
        : {
            contentHash: computeContentHash(newContent),
            producer: humanEditProducer(editedBy),
          }),
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

  private get storage(): ArtifactStorageProvider | undefined {
    return this.injectedStorage ?? configuredArtifactStorageFactory?.();
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
