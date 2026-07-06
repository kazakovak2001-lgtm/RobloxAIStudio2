/**
 * MemoryEngine.ts
 *
 * Core engine for the 3-tier memory system:
 *   STM (short-term) — per-execution (existing ProjectMemory)
 *   LTM (long-term) — persistent cross-session knowledge
 *   SM  (semantic)  — similarity-based retrieval
 *
 * Orchestrates store/retrieve/merge across all tiers.
 * Non-blocking: memory failure returns empty context, never crashes agents.
 */

import { MemoryStore, type MemoryEntry } from "../store/MemoryStore";
import {
  SemanticRetriever,
  type SemanticMatch,
} from "../semantic/SemanticRetriever";

export interface MemoryContext {
  agentId: string;
  projectId?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: Date;
  tags?: string[];
}

export interface RetrievedMemory {
  entries: MemoryEntry[];
  semanticMatches: SemanticMatch[];
  merged: Record<string, unknown>;
}

export class MemoryEngine {
  private store: MemoryStore;
  private semantic: SemanticRetriever;

  constructor(store?: MemoryStore, semantic?: SemanticRetriever) {
    this.store = store ?? new MemoryStore();
    this.semantic = semantic ?? new SemanticRetriever();
  }

  /**
   * Store an agent's execution context and output into LTM.
   */
  async storeMemory(context: MemoryContext): Promise<void> {
    try {
      // Store in LTM
      this.store.store({
        id: `mem-${context.agentId}-${Date.now()}`,
        agentId: context.agentId,
        projectId: context.projectId,
        content: context.output,
        metadata: { input: context.input, tags: context.tags },
        timestamp: context.timestamp,
      });

      // Index for semantic retrieval
      const text = this.extractText(context.output);
      if (text.length > 10) {
        this.semantic.index(context.agentId, text, context.output);
      }

      console.log(
        `[MEMORY-ENGINE] Stored | Agent: ${context.agentId} | Project: ${context.projectId ?? "global"}`,
      );
    } catch {
      // Memory failure must never crash agents
    }
  }

  /**
   * Retrieve relevant memory for an agent before execution.
   * Combines LTM lookup + semantic similarity search.
   */
  async retrieveMemory(
    agentId: string,
    query: string,
    projectId?: string,
    limit = 5,
  ): Promise<RetrievedMemory> {
    try {
      // LTM: recent entries for this agent
      const entries = this.store.getByAgent(agentId, projectId, limit);

      // Semantic: similarity search
      const semanticMatches = this.semantic.search(agentId, query, limit);

      // Merge into context-ready format
      const merged = this.mergeMemory(entries, semanticMatches);

      return { entries, semanticMatches, merged };
    } catch {
      return { entries: [], semanticMatches: [], merged: {} };
    }
  }

  /**
   * Merge retrieved memories into a single context object.
   * Recent entries take priority; semantic matches fill gaps.
   */
  mergeMemory(
    entries: MemoryEntry[],
    semanticMatches: SemanticMatch[],
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};

    // Semantic matches (lower priority — background knowledge)
    for (const match of semanticMatches.slice().reverse()) {
      if (typeof match.data === "object" && match.data !== null) {
        Object.assign(merged, match.data);
      }
    }

    // LTM entries (higher priority — recent experiences)
    for (const entry of entries) {
      if (typeof entry.content === "object" && entry.content !== null) {
        Object.assign(merged, entry.content);
      }
    }

    return merged;
  }

  /**
   * Get the store for direct access (e.g., API layer).
   */
  getStore(): MemoryStore {
    return this.store;
  }

  getSemantic(): SemanticRetriever {
    return this.semantic;
  }

  private extractText(obj: unknown): string {
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj))
      return obj.map((i) => this.extractText(i)).join(" ");
    if (typeof obj === "object" && obj !== null) {
      return Object.values(obj)
        .map((v) => this.extractText(v))
        .join(" ");
    }
    return String(obj ?? "");
  }
}
