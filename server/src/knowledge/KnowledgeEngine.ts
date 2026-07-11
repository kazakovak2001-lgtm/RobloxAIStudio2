/**
 * KnowledgeEngine — Top-level facade for the AI Knowledge & Learning system.
 */

import { PatternRepository } from "./PatternRepository";
import { PromptRankingRepository } from "./PromptRankingRepository";
import { SimilarityEngine } from "./SimilarityEngine";
import type { GenerationRecord, KnowledgeSearchQuery } from "./KnowledgeTypes";

export class KnowledgeEngine {
  readonly patterns: PatternRepository;
  readonly prompts: PromptRankingRepository;
  readonly similarity: SimilarityEngine;

  constructor() {
    this.patterns = new PatternRepository();
    this.prompts = new PromptRankingRepository();
    this.similarity = new SimilarityEngine(this.patterns);
  }

  /**
   * Store a completed generation for learning.
   */
  learn(record: GenerationRecord): void {
    this.similarity.recordGeneration(record);

    // Update pattern usage
    for (const patternName of record.patterns) {
      const pattern = this.patterns
        .getAll()
        .find((p) => p.name === patternName);
      if (pattern) {
        this.patterns.recordUsage(pattern.id, record.finalScore);
      }
    }
  }

  /**
   * Get recommendations before starting a new generation.
   */
  getRecommendations(genre: string, systems: string[]) {
    const similar = this.similarity.findSimilar(genre, systems);
    const patterns = this.patterns.getBestForGenre(genre);
    const topPrompts = this.prompts.getByGenre(genre);

    return {
      similarProjects: similar.slice(0, 3),
      recommendedPatterns: patterns.slice(0, 5),
      bestPrompts: topPrompts.slice(0, 3),
    };
  }

  /**
   * Search knowledge base.
   */
  search(query: KnowledgeSearchQuery) {
    return this.similarity.search(query);
  }
}
