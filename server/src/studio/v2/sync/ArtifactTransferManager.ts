/**
 * ArtifactTransferManager — Handles artifact retrieval and transfer for Studio sync.
 */

import {
  ArtifactStore,
  type PipelineArtifact,
} from "../../../pipeline/v2/ArtifactStore";
import type { ArtifactRef } from "./SyncTypes";
import { createHash } from "crypto";

const MAX_TRANSFER_PAYLOAD_BYTES = 1_048_576; // 1MB

export interface TransferResult {
  artifacts: Array<{
    id: string;
    type: string;
    name: string;
    stage: string;
    size: number;
    createdAt: number;
    reviewStatus: string;
    content: unknown;
  }>;
  missing: string[];
  totalSize: number;
  payloadExceeded: boolean;
}

export class ArtifactTransferManager {
  private artifactStore: ArtifactStore;

  constructor(artifactStore: ArtifactStore) {
    this.artifactStore = artifactStore;
  }

  /**
   * Get artifact references for a pipeline (metadata only, no content).
   */
  getArtifactRefs(pipelineId: string): ArtifactRef[] {
    const artifacts = this.artifactStore.getByPipeline(pipelineId);
    return artifacts.map((a: PipelineArtifact) => this.toRef(a));
  }

  /**
   * Transfer specific artifacts by ID (with content).
   */
  transfer(artifactIds: string[]): TransferResult {
    const result: TransferResult = {
      artifacts: [],
      missing: [],
      totalSize: 0,
      payloadExceeded: false,
    };

    for (const id of artifactIds) {
      const artifact = this.artifactStore.getById(id);
      if (!artifact) {
        result.missing.push(id);
        continue;
      }

      const serialized = JSON.stringify(artifact.content);
      const size = Buffer.byteLength(serialized, "utf8");

      if (result.totalSize + size > MAX_TRANSFER_PAYLOAD_BYTES) {
        result.payloadExceeded = true;
        break;
      }

      result.artifacts.push({
        id: artifact.id,
        type: artifact.type,
        name: artifact.name,
        stage: artifact.stage,
        size: artifact.sizeBytes,
        createdAt: artifact.createdAt,
        reviewStatus: artifact.reviewStatus,
        content: artifact.content,
      });
      result.totalSize += size;
    }

    return result;
  }

  private toRef(artifact: PipelineArtifact): ArtifactRef {
    const hash = createHash("sha256")
      .update(JSON.stringify(artifact.content))
      .digest("hex")
      .slice(0, 16);

    return {
      id: artifact.id,
      type: artifact.type,
      name: artifact.name,
      stage: artifact.stage,
      size: artifact.sizeBytes,
      hash,
      version: 1,
      createdAt: artifact.createdAt,
      reviewStatus: artifact.reviewStatus,
    };
  }
}
