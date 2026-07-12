/**
 * GenerationVersionManager — Version tracking for every generated game.
 */

import { randomUUID } from "crypto";

export interface GenerationVersion {
  id: string;
  projectId: string;
  generationId: string;
  engineVersion: string;
  agentVersions: Record<string, string>;
  timestamp: number;
  qualityScore: number;
  scriptCount: number;
  assetCount: number;
  snapshot: Record<string, unknown>;
}

export class GenerationVersionManager {
  private versions: Map<string, GenerationVersion[]> = new Map();

  save(
    projectId: string,
    data: Omit<GenerationVersion, "id" | "generationId" | "timestamp">,
  ): GenerationVersion {
    const version: GenerationVersion = {
      ...data,
      id: `gv-${randomUUID().slice(0, 8)}`,
      generationId: `gen-${randomUUID().slice(0, 10)}`,
      timestamp: Date.now(),
    };
    const list = this.versions.get(projectId) ?? [];
    list.push(version);
    this.versions.set(projectId, list);
    return version;
  }

  getHistory(projectId: string): GenerationVersion[] {
    return (this.versions.get(projectId) ?? []).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  }

  getLatest(projectId: string): GenerationVersion | null {
    const list = this.versions.get(projectId) ?? [];
    return list.length > 0 ? list[list.length - 1] : null;
  }

  compare(
    projectId: string,
    versionA: string,
    versionB: string,
  ): { scoreChange: number; scriptChange: number } | null {
    const list = this.versions.get(projectId) ?? [];
    const a = list.find((v) => v.id === versionA);
    const b = list.find((v) => v.id === versionB);
    if (!a || !b) return null;
    return {
      scoreChange: b.qualityScore - a.qualityScore,
      scriptChange: b.scriptCount - a.scriptCount,
    };
  }
}
