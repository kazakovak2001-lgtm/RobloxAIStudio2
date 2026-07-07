/**
 * Memory & Knowledge System — public API (v2.9)
 */
export { KnowledgeMemoryManager } from "./MemoryManager";
export { KnowledgeRepository } from "./KnowledgeRepository";
export { ArtifactIndex } from "./ArtifactIndex";
export {
  ContextResolver,
  type ContextQuery,
  type BuiltContext,
} from "./ContextResolver";
export { MemoryStorage } from "./MemoryStorage";
export { MemoryMetrics } from "./MemoryMetrics";
export type {
  MemoryEntry,
  KnowledgeDocument,
  KnowledgeCategory,
  ArtifactMetadata,
  MemorySessionData,
  ContextWindow,
  MemoryMetricsData,
  MemorySnapshot,
} from "./types";
