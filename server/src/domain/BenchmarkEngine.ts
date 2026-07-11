/**
 * BenchmarkEngine — Compares a project against reference genre architecture.
 */

import type {
  GameGenre,
  BenchmarkResult,
  DomainAnalysisInput,
} from "./DomainTypes";
import { GenreLibrary } from "./GenreLibrary";

export class BenchmarkEngine {
  private genreLibrary: GenreLibrary;

  constructor(genreLibrary: GenreLibrary) {
    this.genreLibrary = genreLibrary;
  }

  /**
   * Benchmark a project against its genre reference.
   */
  analyze(input: DomainAnalysisInput): BenchmarkResult {
    const genre = input.genre as GameGenre;
    const blueprint = this.genreLibrary.get(genre);

    if (!blueprint) {
      return this.emptyResult(genre);
    }

    const completeness = this.scoreCompleteness(input, blueprint);
    const complexity = this.scoreComplexity(input, blueprint);
    const scalability = this.scoreScalability(input);
    const maintainability = this.scoreMaintainability(input, blueprint);

    const overallScore = Math.round(
      completeness * 0.35 +
        complexity * 0.2 +
        scalability * 0.25 +
        maintainability * 0.2,
    );

    const missingRequired = blueprint.requiredSystems.filter(
      (sys) => !input.systems.some((s) => s.includes(sys) || sys.includes(s)),
    );

    const recommendations = this.generateRecommendations(
      input,
      blueprint,
      missingRequired,
    );

    return {
      genre,
      completeness,
      complexity,
      scalability,
      maintainability,
      overallScore,
      missingRequired,
      recommendations,
    };
  }

  private scoreCompleteness(
    input: DomainAnalysisInput,
    blueprint: import("./DomainTypes").GenreBlueprint,
  ): number {
    const required = blueprint.requiredSystems;
    const implemented = input.systems.filter((s) =>
      required.some((r) => s.includes(r) || r.includes(s)),
    );
    return Math.round(
      (implemented.length / Math.max(required.length, 1)) * 100,
    );
  }

  private scoreComplexity(
    input: DomainAnalysisInput,
    blueprint: import("./DomainTypes").GenreBlueprint,
  ): number {
    const ratio = input.scriptCount / Math.max(blueprint.estimatedScripts, 1);
    if (ratio >= 0.8 && ratio <= 1.5) return 90;
    if (ratio >= 0.5) return 70;
    return 50;
  }

  private scoreScalability(input: DomainAnalysisInput): number {
    let score = 70;
    if (input.hasMultiplayer) score += 10;
    if (input.scriptCount >= 5) score += 5;
    if (input.assetCount >= 10) score += 5;
    if (input.scriptCount > 20) score -= 10; // Too complex
    return Math.max(0, Math.min(100, score));
  }

  private scoreMaintainability(
    input: DomainAnalysisInput,
    blueprint: import("./DomainTypes").GenreBlueprint,
  ): number {
    let score = 75;
    // More systems = more modular
    if (input.systems.length >= blueprint.requiredSystems.length) score += 10;
    // Reasonable script count
    if (input.scriptCount <= blueprint.estimatedScripts * 1.2) score += 10;
    if (input.scriptCount > blueprint.estimatedScripts * 2) score -= 15;
    return Math.max(0, Math.min(100, score));
  }

  private generateRecommendations(
    input: DomainAnalysisInput,
    blueprint: import("./DomainTypes").GenreBlueprint,
    missing: string[],
  ): string[] {
    const recs: string[] = [];
    for (const sys of missing.slice(0, 3)) {
      recs.push(`Add required system: ${sys}`);
    }
    if (input.scriptCount < blueprint.estimatedScripts * 0.5) {
      recs.push("Project appears incomplete — add more systems");
    }
    if (
      !input.hasMultiplayer &&
      blueprint.requiredSystems.includes("matchmaking")
    ) {
      recs.push("This genre typically requires multiplayer support");
    }
    return recs;
  }

  private emptyResult(genre: GameGenre): BenchmarkResult {
    return {
      genre,
      completeness: 0,
      complexity: 0,
      scalability: 0,
      maintainability: 0,
      overallScore: 0,
      missingRequired: [],
      recommendations: ["Unknown genre — cannot benchmark"],
    };
  }
}
