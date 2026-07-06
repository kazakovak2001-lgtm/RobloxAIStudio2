/**
 * AgentSelectionPolicy.ts
 *
 * Configurable policy engine that defines HOW agents are scored and selected.
 * Three risk-tolerance modes:
 *   - strict: prefer stable, reliable agents (minimize failure)
 *   - balanced: default — equal weight to quality and reliability
 *   - experimental: prefer highest quality even with lower reliability
 */

import type {
  SelectionPolicyConfig,
  SelectionPolicyMode,
  AgentScore,
} from "./types";

const POLICIES: Record<SelectionPolicyMode, SelectionPolicyConfig> = {
  strict: {
    mode: "strict",
    weights: {
      successRate: 0.35,
      quality: 0.15,
      speed: 0.1,
      reliability: 0.3,
      contextFit: 0.1,
    },
    thresholds: { minSuccessRate: 0.7, minQuality: 40, maxSwitchesPerNode: 1 },
  },
  balanced: {
    mode: "balanced",
    weights: {
      successRate: 0.25,
      quality: 0.25,
      speed: 0.15,
      reliability: 0.2,
      contextFit: 0.15,
    },
    thresholds: { minSuccessRate: 0.5, minQuality: 30, maxSwitchesPerNode: 2 },
  },
  experimental: {
    mode: "experimental",
    weights: {
      successRate: 0.15,
      quality: 0.35,
      speed: 0.1,
      reliability: 0.15,
      contextFit: 0.25,
    },
    thresholds: { minSuccessRate: 0.3, minQuality: 20, maxSwitchesPerNode: 3 },
  },
};

export class AgentSelectionPolicy {
  private config: SelectionPolicyConfig;

  constructor(mode: SelectionPolicyMode = "balanced") {
    this.config = POLICIES[mode];
  }

  /**
   * Compute composite score for an agent given the current policy.
   */
  computeComposite(
    score: Omit<
      AgentScore,
      "compositeScore" | "lastUpdated" | "executionCount"
    >,
  ): number {
    const w = this.config.weights;
    return Math.round(
      score.successRate * 100 * w.successRate +
        score.avgQuality * w.quality +
        score.speedScore * w.speed +
        score.reliabilityIndex * w.reliability +
        score.contextFitScore * w.contextFit,
    );
  }

  /**
   * Check if an agent meets minimum eligibility.
   */
  isEligible(score: AgentScore): boolean {
    if (score.successRate < this.config.thresholds.minSuccessRate) return false;
    if (score.avgQuality < this.config.thresholds.minQuality) return false;
    return true;
  }

  /**
   * Get maximum allowed switches per node.
   */
  get maxSwitchesPerNode(): number {
    return this.config.thresholds.maxSwitchesPerNode;
  }

  /**
   * Get the current policy mode.
   */
  get mode(): SelectionPolicyMode {
    return this.config.mode;
  }

  /**
   * Get full config (for reporting).
   */
  getConfig(): SelectionPolicyConfig {
    return { ...this.config };
  }

  /**
   * Switch to a different policy mode.
   */
  setMode(mode: SelectionPolicyMode): void {
    this.config = POLICIES[mode];
  }
}
