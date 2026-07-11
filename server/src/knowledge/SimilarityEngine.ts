/**
 * SimilarityEngine — Compares projects to find best matches and recommendations.
 */

import type {
  GenerationRecord,
  SimilarityResult,
  KnowledgeSearchQuery,
} from "./KnowledgeTypes";
import type { PatternRepository } from "./PatternRepository";

export class SimilarityEngine {
  private history: GenerationRecord[] = [];
  private patternRepo: PatternRepository;

  constructor(patternRepo: PatternRepository) {
    this.patternRepo = patternRepo;
  }

  recordGeneration(record: GenerationRecord): void {
    this.history.push(record);
  }

  search(query: KnowledgeSearchQuery): SimilarityResult[] {
    return this.history
      .filter((record) => {
        if (query.minScore && record.finalScore < query.minScore) return false;
        return true;
      })
      .map((record) => this.computeSimilarity(record, query))
      .filter((r) => r.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  findSimilar(genre: string, systems: string[]): SimilarityResult[] {
    return this.search({ genre, systems });
  }

  recommend(genre: string, systems: string[]): string[] {
    const patterns = this.patternRepo.getBestForGenre(genre);
    const matchingPatterns = patterns.filter((p) =>
      p.scripts.some((s) =>
        systems.some((sys) => s.toLowerCase().includes(sys)),
      ),
    );
    return matchingPatterns.map((p) => p.name);
  }

  getHistory(): GenerationRecord[] {
    return [...this.history].sort((a, b) => b.createdAt - a.createdAt);
  }

  private computeSimilarity(
    record: GenerationRecord,
    query: KnowledgeSearchQuery,
  ): SimilarityResult {
    let score = 0;
    const matchedSystems: string[] = [];

    // Genre match
    const matchedGenre = query.genre ? record.genre === query.genre : false;
    if (matchedGenre) score += 0.3;

    // Systems match
    if (query.systems) {
      for (const sys of query.systems) {
        if (record.systems.includes(sys)) {
          matchedSystems.push(sys);
          score += 0.1;
        }
      }
    }

    // Mechanics match
    if (query.mechanics) {
      for (const mech of query.mechanics) {
        if (record.mechanics.includes(mech)) score += 0.05;
      }
    }

    // Bonus for high-scoring projects
    if (record.finalScore >= 80) score += 0.1;

    const recommendedPatterns = this.patternRepo
      .getBestForGenre(record.genre)
      .map((p) => p.name)
      .slice(0, 3);

    return {
      projectId: record.projectId,
      score: Math.min(1, score),
      matchedSystems,
      matchedGenre,
      recommendedPatterns,
    };
  }
}
