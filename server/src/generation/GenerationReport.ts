import type {
  GenerationReport,
  GenerationReportSection,
} from "./GenerationTypes";
import type { GameBlueprint } from "./GenerationBlueprint";
import type { PlanningMetrics } from "../planning/PlanningTypes";

/**
 * Build a structured human-readable generation report from a completed blueprint.
 */
export function buildGenerationReport(
  blueprint: GameBlueprint,
  planningMetrics?: PlanningMetrics,
): GenerationReport {
  const sections: GenerationReportSection[] = [];

  // ── Summary ──────────────────────────────────────────────────────────────
  sections.push({
    title: "Generation Summary",
    content: {
      name: blueprint.project?.name ?? "Unknown",
      gameType: blueprint.project?.gameType ?? "N/A",
      genre: blueprint.project?.genre?.join(", ") ?? "N/A",
      status: blueprint.status,
      validationScore: blueprint.validation?.score ?? "N/A",
      qualityScore: blueprint.evaluation?.lastScore ?? "N/A",
    },
  });

  // ── Execution Timeline ───────────────────────────────────────────────────
  if (blueprint.pipeline) {
    sections.push({
      title: "Execution Timeline",
      content: {
        startedAt: blueprint.pipeline.startedAt,
        completedSteps: blueprint.pipeline.completedSteps,
        failedStep: blueprint.pipeline.failedStep ?? "none",
        totalDurationMs: blueprint.pipeline.totalDurationMs ?? "N/A",
      },
    });
  }

  // ── Planning Metrics ─────────────────────────────────────────────────────
  if (planningMetrics) {
    sections.push({
      title: "Planning Metrics",
      content: {
        totalSteps: planningMetrics.totalSteps,
        completedSteps: planningMetrics.completedSteps,
        failedSteps: planningMetrics.failedSteps,
        criticalPathMs: planningMetrics.criticalPathMs,
        parallelOpportunities: planningMetrics.parallelOpportunities,
        replanCount: planningMetrics.replanCount,
        successRatio: `${(planningMetrics.successRatio * 100).toFixed(1)}%`,
      },
    });
  }

  // ── Evaluation Results ───────────────────────────────────────────────────
  if (blueprint.evaluation) {
    sections.push({
      title: "Evaluation Results",
      content: {
        lastScore: blueprint.evaluation.lastScore,
        lastStatus: blueprint.evaluation.lastStatus,
        totalIssues: blueprint.evaluation.totalIssues,
      },
    });
  }

  // ── Warnings ─────────────────────────────────────────────────────────────
  if (blueprint.memory?.warnings?.length) {
    sections.push({
      title: "Warnings",
      content: blueprint.memory.warnings.join("\n"),
    });
  }

  // ── Recommendations ──────────────────────────────────────────────────────
  if (blueprint.memory?.recommendations?.length) {
    sections.push({
      title: "Recommendations",
      content: blueprint.memory.recommendations.join("\n"),
    });
  }

  // ── Architectural Decisions ──────────────────────────────────────────────
  if (blueprint.decisions?.length) {
    sections.push({
      title: "Architectural Decisions",
      content: {
        count: blueprint.decisions.length,
        decisions: blueprint.decisions.map((d) => ({
          category: d.category,
          summary: d.summary,
          agent: d.agent,
        })),
      },
    });
  }

  // ── Blueprint Statistics ─────────────────────────────────────────────────
  sections.push({
    title: "Blueprint Statistics",
    content: {
      sectionsPresent: blueprint.validation?.sectionsPresent ?? [],
      sectionsMissing: blueprint.validation?.sectionsMissing ?? [],
      mechanicsCount: blueprint.gameplay?.mechanics?.length ?? 0,
      serverScripts: blueprint.scripts?.server?.length ?? 0,
      clientScripts: blueprint.scripts?.client?.length ?? 0,
      sharedModules: blueprint.scripts?.shared?.length ?? 0,
      uiScreens: blueprint.ui?.screens?.length ?? 0,
    },
  });

  const summary =
    `Generation ${blueprint.status === "complete" ? "completed successfully" : "failed"} ` +
    `for "${blueprint.project?.name ?? "Unknown"}" | ` +
    `Score: ${blueprint.validation?.score ?? "N/A"}/100 | ` +
    `Decisions: ${blueprint.decisions?.length ?? 0}`;

  console.log(`[GENERATION] Report Created | ${summary}`);

  return {
    generationId: blueprint.id,
    createdAt: new Date(),
    summary,
    sections,
  };
}
