/**
 * DomainEngine — Top-level facade for Roblox Domain Intelligence.
 */

import type { GameGenre, DomainAnalysisInput } from "./DomainTypes";
import { GenreLibrary } from "./GenreLibrary";
import { BestPracticesDB } from "./BestPractices";
import { BenchmarkEngine } from "./BenchmarkEngine";

export class DomainEngine {
  readonly genres: GenreLibrary;
  readonly bestPractices: BestPracticesDB;
  readonly benchmark: BenchmarkEngine;

  constructor() {
    this.genres = new GenreLibrary();
    this.bestPractices = new BestPracticesDB();
    this.benchmark = new BenchmarkEngine(this.genres);
  }

  analyze(input: DomainAnalysisInput) {
    return this.benchmark.analyze(input);
  }

  getRecommendations(genre: GameGenre) {
    return this.genres.recommend(genre);
  }
}
