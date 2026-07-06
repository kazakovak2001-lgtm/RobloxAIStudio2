/**
 * SharedAgentContext.ts — Shared knowledge + artifact store for agents.
 */

import type { SharedKnowledge } from "./types";

export class SharedAgentContext {
  private knowledge: Map<string, SharedKnowledge> = new Map();
  private artifacts: Map<string, unknown> = new Map();

  setKnowledge(key: string, value: unknown, producedBy: string): void {
    this.knowledge.set(key, { key, value, producedBy, timestamp: Date.now() });
  }

  getKnowledge(key: string): unknown | undefined {
    return this.knowledge.get(key)?.value;
  }
  hasKnowledge(key: string): boolean {
    return this.knowledge.has(key);
  }
  getAllKnowledge(): SharedKnowledge[] {
    return [...this.knowledge.values()];
  }

  storeArtifact(id: string, artifact: unknown): void {
    this.artifacts.set(id, artifact);
  }
  getArtifact(id: string): unknown | undefined {
    return this.artifacts.get(id);
  }
  hasArtifact(id: string): boolean {
    return this.artifacts.has(id);
  }
  get artifactCount(): number {
    return this.artifacts.size;
  }
  get knowledgeCount(): number {
    return this.knowledge.size;
  }

  toRecord(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of this.knowledge) result[k] = v.value;
    return result;
  }

  clear(): void {
    this.knowledge.clear();
    this.artifacts.clear();
  }
}
