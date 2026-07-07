/**
 * KnowledgeRepository.ts — Stores and retrieves knowledge documents.
 */

import type { KnowledgeDocument, KnowledgeCategory } from "./types";
import { createDocId } from "./types";

export class KnowledgeRepository {
  private documents: Map<string, KnowledgeDocument> = new Map();

  add(
    category: KnowledgeCategory,
    title: string,
    content: unknown,
    tags: string[] = [],
    version = "1.0.0",
  ): KnowledgeDocument {
    const doc: KnowledgeDocument = {
      id: createDocId(),
      category,
      title,
      content,
      tags,
      version,
      createdAt: Date.now(),
    };
    this.documents.set(doc.id, doc);
    return doc;
  }

  get(id: string): KnowledgeDocument | undefined {
    return this.documents.get(id);
  }
  getByCategory(category: KnowledgeCategory): KnowledgeDocument[] {
    return [...this.documents.values()].filter((d) => d.category === category);
  }
  getByTags(tags: string[]): KnowledgeDocument[] {
    return [...this.documents.values()].filter((d) =>
      tags.some((t) => d.tags.includes(t)),
    );
  }
  search(query: string): KnowledgeDocument[] {
    const q = query.toLowerCase();
    return [...this.documents.values()].filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  getAll(): KnowledgeDocument[] {
    return [...this.documents.values()];
  }
  delete(id: string): boolean {
    return this.documents.delete(id);
  }
  get size(): number {
    return this.documents.size;
  }
  clear(): void {
    this.documents.clear();
  }
}
