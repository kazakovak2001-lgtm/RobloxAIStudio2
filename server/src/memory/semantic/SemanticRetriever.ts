/**
 * SemanticRetriever.ts
 *
 * Similarity-based retrieval layer for agent memory.
 * Uses simple TF-IDF / cosine approximation (no external dependencies).
 * Designed for future swap to vector DB (Pinecone, Qdrant, etc.).
 *
 * Current implementation: bag-of-words cosine similarity (lightweight, deterministic).
 */

export interface SemanticMatch {
  agentId: string;
  text: string;
  data: Record<string, unknown>;
  similarity: number; // 0–1
  indexedAt: Date;
}

interface IndexedDocument {
  agentId: string;
  projectId?: string;
  text: string;
  tokens: string[];
  data: Record<string, unknown>;
  indexedAt: Date;
}

export class SemanticRetriever {
  private documents: IndexedDocument[] = [];
  private maxDocuments: number;

  constructor(maxDocuments = 500) {
    this.maxDocuments = maxDocuments;
  }

  /**
   * Index a text document for future retrieval.
   * projectId scopes the document; omit only for genuinely projectless data —
   * it will then only ever match a projectless search (see `search`).
   */
  index(
    agentId: string,
    text: string,
    data: Record<string, unknown>,
    projectId?: string,
  ): void {
    const tokens = this.tokenize(text);
    this.documents.push({
      agentId,
      projectId,
      text,
      tokens,
      data,
      indexedAt: new Date(),
    });

    if (this.documents.length > this.maxDocuments) {
      this.documents.shift();
    }
  }

  /**
   * Search for documents similar to a query string.
   * Filters by agentId AND projectId — agentId alone is not tenant-unique
   * (e.g. "world-intelligence" is reused across every project), so an
   * agentId-only filter would return another project's indexed content.
   * A projectId must match exactly, including the projectless (undefined)
   * case, so a projectless search never resolves a project-owned document
   * or vice versa.
   */
  search(
    agentId: string,
    query: string,
    limit = 5,
    projectId?: string,
  ): SemanticMatch[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const agentDocs = this.documents.filter(
      (d) => d.agentId === agentId && d.projectId === projectId,
    );

    const scored: SemanticMatch[] = agentDocs.map((doc) => ({
      agentId: doc.agentId,
      text: doc.text.slice(0, 200),
      data: doc.data,
      similarity: this.cosineSimilarity(queryTokens, doc.tokens),
      indexedAt: doc.indexedAt,
    }));

    // Sort by similarity descending, return top N
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit).filter((m) => m.similarity > 0.05);
  }

  /**
   * Search across all agents (global semantic search).
   */
  searchGlobal(query: string, limit = 10): SemanticMatch[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const scored: SemanticMatch[] = this.documents.map((doc) => ({
      agentId: doc.agentId,
      text: doc.text.slice(0, 200),
      data: doc.data,
      similarity: this.cosineSimilarity(queryTokens, doc.tokens),
      indexedAt: doc.indexedAt,
    }));

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit).filter((m) => m.similarity > 0.05);
  }

  get indexedCount(): number {
    return this.documents.length;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private cosineSimilarity(tokensA: string[], tokensB: string[]): number {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) intersection++;
    }

    // Jaccard-like cosine approximation
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / Math.sqrt(setA.size * setB.size);
  }
}
