/**
 * PromptQualityValidator — Validates generated agent prompts for completeness and quality.
 */

import type {
  AgentPromptPackage,
  PromptQualityScore,
} from "./GameArchitectTypes";

export class PromptQualityValidator {
  /**
   * Validate a prompt package and return a quality score.
   */
  validate(prompts: AgentPromptPackage): PromptQualityScore {
    const issues: string[] = [];
    let completeness = 0;
    let technicalAccuracy = 0;
    let robloxCompatibility = 0;

    // Completeness: check all prompts have required fields
    completeness = this.scoreCompleteness(prompts, issues);

    // Technical accuracy: check for contradictions and missing requirements
    technicalAccuracy = this.scoreTechnicalAccuracy(prompts, issues);

    // Roblox compatibility: check for platform-specific concerns
    robloxCompatibility = this.scoreRobloxCompatibility(prompts, issues);

    const overall = Math.round(
      completeness * 0.4 +
        technicalAccuracy * 0.35 +
        robloxCompatibility * 0.25,
    );

    return {
      overall,
      completeness,
      technicalAccuracy,
      robloxCompatibility,
      classification:
        overall >= 90
          ? "production_ready"
          : overall >= 70
            ? "needs_refinement"
            : "requires_improvement",
      issues,
    };
  }

  private scoreCompleteness(
    prompts: AgentPromptPackage,
    issues: string[],
  ): number {
    let score = 100;
    const minAgents = 5;

    if (prompts.totalAgents < minAgents) {
      score -= 20;
      issues.push(
        `Only ${prompts.totalAgents} agents (minimum ${minAgents} recommended)`,
      );
    }

    for (const prompt of prompts.prompts) {
      if (!prompt.objective || prompt.objective.length < 20) {
        score -= 5;
        issues.push(`${prompt.agentName}: objective too short or missing`);
      }
      if (prompt.responsibilities.length < 3) {
        score -= 5;
        issues.push(`${prompt.agentName}: fewer than 3 responsibilities`);
      }
      if (prompt.technicalRequirements.length < 2) {
        score -= 5;
        issues.push(`${prompt.agentName}: fewer than 2 technical requirements`);
      }
      if (prompt.expectedOutput.length < 2) {
        score -= 3;
        issues.push(`${prompt.agentName}: fewer than 2 expected outputs`);
      }
      if (prompt.validationRules.length < 2) {
        score -= 3;
        issues.push(`${prompt.agentName}: fewer than 2 validation rules`);
      }
      if (!prompt.context || prompt.context.length < 10) {
        score -= 3;
        issues.push(`${prompt.agentName}: missing or minimal context`);
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private scoreTechnicalAccuracy(
    prompts: AgentPromptPackage,
    issues: string[],
  ): number {
    let score = 100;

    // Check for programmer agent (must exist for any game)
    const hasProgrammer = prompts.prompts.some(
      (p) => p.agentId === "programmer" || p.agentId === "gameplay_developer",
    );
    if (!hasProgrammer) {
      score -= 20;
      issues.push("Missing programmer/gameplay developer agent");
    }

    // Check for world builder
    const hasWorldBuilder = prompts.prompts.some(
      (p) => p.agentId === "world_builder",
    );
    if (!hasWorldBuilder) {
      score -= 10;
      issues.push("Missing world builder agent");
    }

    // Check for QA
    const hasQA = prompts.prompts.some((p) => p.agentId === "qa_tester");
    if (!hasQA) {
      score -= 10;
      issues.push("Missing QA/testing agent");
    }

    // Check for contradictions (server vs client responsibilities)
    const serverAgent = prompts.prompts.find((p) => p.agentId === "programmer");
    const clientAgent = prompts.prompts.find((p) => p.agentId === "ui_ux");
    if (serverAgent && clientAgent) {
      const serverResp = serverAgent.responsibilities.join(" ").toLowerCase();
      const clientResp = clientAgent.responsibilities.join(" ").toLowerCase();
      if (
        serverResp.includes("render") ||
        serverResp.includes("animation display")
      ) {
        score -= 10;
        issues.push(
          "Server agent has client-side rendering responsibilities (contradiction)",
        );
      }
      if (clientResp.includes("datastore") || clientResp.includes("persist")) {
        score -= 10;
        issues.push(
          "UI agent has server-side data responsibilities (contradiction)",
        );
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private scoreRobloxCompatibility(
    prompts: AgentPromptPackage,
    issues: string[],
  ): number {
    let score = 100;

    for (const prompt of prompts.prompts) {
      const allText = [
        prompt.objective,
        ...prompt.responsibilities,
        ...prompt.technicalRequirements,
        prompt.context,
      ]
        .join(" ")
        .toLowerCase();

      // Check for non-Roblox technologies mentioned as requirements
      if (allText.includes("unity") && !allText.includes("not unity")) {
        score -= 15;
        issues.push(
          `${prompt.agentName}: references Unity (not Roblox-compatible)`,
        );
      }
      if (allText.includes("unreal")) {
        score -= 15;
        issues.push(`${prompt.agentName}: references Unreal Engine`);
      }
      if (allText.includes("c#") || allText.includes("c++")) {
        score -= 10;
        issues.push(`${prompt.agentName}: references non-Luau languages`);
      }

      // Check for Roblox-specific patterns
      if (prompt.agentId === "programmer") {
        if (
          !allText.includes("luau") &&
          !allText.includes("lua") &&
          !allText.includes("server")
        ) {
          score -= 10;
          issues.push(
            `${prompt.agentName}: doesn't mention Luau or server-side pattern`,
          );
        }
      }
    }

    return Math.max(0, Math.min(100, score));
  }
}
