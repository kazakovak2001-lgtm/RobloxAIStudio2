/**
 * Pipeline Artifact Storage — stores outputs from each pipeline stage.
 */

import { randomUUID } from "crypto";
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
}

export type ArtifactType =
  | "json"
  | "lua"
  | "markdown"
  | "text"
  | "manifest"
  | "ui-layout"
  | "asset-plan";

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

  /**
   * Store an artifact produced by a pipeline stage.
   */
  store(
    pipelineId: string,
    stage: StageName,
    agent: string | null,
    content: unknown,
  ): PipelineArtifact {
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
    };

    this.artifacts.set(artifact.id, artifact);

    const pipelineArtifacts = this.byPipeline.get(pipelineId) ?? [];
    pipelineArtifacts.push(artifact.id);
    this.byPipeline.set(pipelineId, pipelineArtifacts);

    return artifact;
  }

  /**
   * Get all artifacts for a pipeline.
   */
  getByPipeline(pipelineId: string): PipelineArtifact[] {
    const ids = this.byPipeline.get(pipelineId) ?? [];
    return ids
      .map((id) => this.artifacts.get(id))
      .filter((a): a is PipelineArtifact => a !== undefined);
  }

  /**
   * Get a single artifact by ID.
   */
  getById(artifactId: string): PipelineArtifact | null {
    return this.artifacts.get(artifactId) ?? null;
  }

  /**
   * Mark an artifact as validated.
   */
  markValidated(artifactId: string): void {
    const artifact = this.artifacts.get(artifactId);
    if (artifact) {
      artifact.validated = true;
    }
  }

  /**
   * Get artifact count.
   */
  get count(): number {
    return this.artifacts.size;
  }
}
