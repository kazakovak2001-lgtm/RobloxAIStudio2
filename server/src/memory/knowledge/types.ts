/**
 * Memory & Knowledge System types (v2.9)
 */

import { randomUUID } from "crypto";

export type KnowledgeCategory =
  | "architecture"
  | "generation"
  | "validation"
  | "lua"
  | "ui"
  | "assets"
  | "gameplay"
  | "documentation"
  | "custom";

export interface MemoryEntry {
  id: string;
  projectId: string;
  category: KnowledgeCategory;
  key: string;
  value: unknown;
  tags: string[];
  version: number;
  createdAt: number;
  updatedAt: number;
  source: string;
}

export interface KnowledgeDocument {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: unknown;
  tags: string[];
  version: string;
  createdAt: number;
}

export interface ArtifactMetadata {
  id: string;
  artifactType:
    "script" | "module" | "ui" | "asset" | "manifest" | "report" | "config";
  name: string;
  path: string;
  projectId: string;
  generatedBy: string;
  version: number;
  size: number;
  tags: string[];
  createdAt: number;
}

export interface MemorySessionData {
  sessionId: string;
  projectId: string;
  startedAt: number;
  entries: string[];
  artifacts: string[];
}

export interface ContextWindow {
  entries: MemoryEntry[];
  artifacts: ArtifactMetadata[];
  totalSize: number;
  maxSize: number;
}

export interface MemoryMetricsData {
  storedEntries: number;
  indexedArtifacts: number;
  knowledgeDocuments: number;
  retrievalLatencyMs: number;
  storageSizeEstimate: number;
  cacheHitRatio: number;
  retrievalSuccessRate: number;
}

export interface MemorySnapshot {
  projectId: string;
  entries: MemoryEntry[];
  artifacts: ArtifactMetadata[];
  documents: KnowledgeDocument[];
  timestamp: number;
  version: number;
}

export function createMemoryId(): string {
  return `mem-${randomUUID().slice(0, 10)}`;
}
export function createDocId(): string {
  return `doc-${randomUUID().slice(0, 8)}`;
}
