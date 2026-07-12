/**
 * GameQualityScorer — Advanced multi-category quality scoring.
 */

export interface QualityCategories {
  architecture: number;
  codeQuality: number;
  performance: number;
  gameplayCompleteness: number;
  security: number;
  robloxStandards: number;
}

export interface QualityReport {
  overall: number;
  categories: QualityCategories;
  classification: "excellent" | "good" | "acceptable" | "needs_work" | "poor";
  issues: string[];
}

export interface QualityInput {
  scriptCount: number;
  hasConfig: boolean;
  hasDataStore: boolean;
  hasRemoteEvents: boolean;
  hasServerAuth: boolean;
  hasClientScripts: boolean;
  circularDeps: number;
  validationScore: number;
  playtestScore: number;
  assetCount: number;
  hasMultiplayer: boolean;
}

export class GameQualityScorer {
  score(input: QualityInput): QualityReport {
    const categories: QualityCategories = {
      architecture: this.scoreArchitecture(input),
      codeQuality: this.scoreCodeQuality(input),
      performance: this.scorePerformance(input),
      gameplayCompleteness: this.scoreGameplay(input),
      security: this.scoreSecurity(input),
      robloxStandards: this.scoreRobloxStandards(input),
    };

    const overall = Math.round(
      Object.values(categories).reduce((s, v) => s + v, 0) / 6,
    );

    const issues: string[] = [];
    if (categories.architecture < 60)
      issues.push("Architecture needs improvement");
    if (categories.security < 70) issues.push("Security concerns detected");
    if (categories.performance < 60)
      issues.push("Performance optimization needed");

    return {
      overall,
      categories,
      classification:
        overall >= 90
          ? "excellent"
          : overall >= 75
            ? "good"
            : overall >= 60
              ? "acceptable"
              : overall >= 40
                ? "needs_work"
                : "poor",
      issues,
    };
  }

  private scoreArchitecture(input: QualityInput): number {
    let score = 50;
    if (input.hasConfig) score += 15;
    if (input.hasRemoteEvents) score += 15;
    if (input.circularDeps === 0) score += 10;
    if (input.scriptCount >= 5) score += 10;
    return Math.min(100, score);
  }

  private scoreCodeQuality(input: QualityInput): number {
    let score = input.validationScore;
    if (input.circularDeps > 0) score -= 20;
    return Math.max(0, Math.min(100, score));
  }

  private scorePerformance(input: QualityInput): number {
    let score = 80;
    if (input.scriptCount > 20) score -= 10;
    if (input.assetCount > 50) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  private scoreGameplay(input: QualityInput): number {
    let score = 40;
    if (input.hasDataStore) score += 20;
    if (input.hasClientScripts) score += 15;
    if (input.hasRemoteEvents) score += 15;
    if (input.hasMultiplayer) score += 10;
    return Math.min(100, score);
  }

  private scoreSecurity(input: QualityInput): number {
    let score = 60;
    if (input.hasServerAuth) score += 20;
    if (input.hasRemoteEvents) score += 10;
    if (input.circularDeps === 0) score += 10;
    return Math.min(100, score);
  }

  private scoreRobloxStandards(input: QualityInput): number {
    let score = 50;
    if (input.hasConfig) score += 15;
    if (input.hasDataStore) score += 15;
    if (input.hasRemoteEvents) score += 10;
    if (input.scriptCount >= 5) score += 10;
    return Math.min(100, score);
  }
}
