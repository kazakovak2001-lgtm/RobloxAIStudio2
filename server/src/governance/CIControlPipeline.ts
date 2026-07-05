import type { ImpactAnalysis } from "../assembly/AssemblyImpactAnalyzer";
import type { AssemblyDiff } from "../assembly/AssemblyDiffEngine";
import type { ChangeGraph } from "../assembly/AssemblyChangeGraph";
import {
  GovernancePolicyEngine,
  type GovernanceDecision,
} from "./GovernancePolicyEngine";
import { AssemblyDiffEngine } from "../assembly/AssemblyDiffEngine";
import { AssemblyChangeGraphBuilder } from "../assembly/AssemblyChangeGraph";
import { AssemblyImpactAnalyzer } from "../assembly/AssemblyImpactAnalyzer";
import type { ProjectAssembly } from "../assembly/AssemblyTypes";
import type { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../execution/pipelineTypes";

/**
 * CIResult — final output of the CI/CD control pipeline.
 */
export interface CIResult {
  assemblyId: string;
  version: string;
  decision: GovernanceDecision;
  pipelineStatus: "PASSED" | "FAILED" | "BLOCKED";
  executedStages: string[];
  analysis?: ImpactAnalysis;
  diff?: AssemblyDiff;
  timestamp: Date;
}

/**
 * CIControlPipeline
 *
 * Central orchestration of CI/CD decisions.
 * Pipeline flow: diff → graph → impact → governance → decision → emit
 *
 * This is the authoritative decision layer that governs all build paths.
 * Deterministic: same assemblies → same decision.
 */
export class CIControlPipeline {
  private governanceEngine: GovernancePolicyEngine;
  private diffEngine = new AssemblyDiffEngine();
  private graphBuilder = new AssemblyChangeGraphBuilder();
  private impactAnalyzer = new AssemblyImpactAnalyzer();

  constructor(
    private readonly events?: PipelineEventEmitter,
    governanceEngine?: GovernancePolicyEngine,
  ) {
    this.governanceEngine = governanceEngine ?? new GovernancePolicyEngine();
  }

  /**
   * Process a build through the full CI/CD pipeline.
   * Compares current assembly against a base version (or empty assembly if first build).
   */
  async processBuild(
    currentAssembly: ProjectAssembly,
    baseAssembly: ProjectAssembly | null,
    currentVersion: string,
    baseVersion: string,
  ): Promise<CIResult> {
    const stages: string[] = [];
    const assemblyId = currentAssembly.id;

    // ── Stage 1: Diff ────────────────────────────────────────────────────
    stages.push("diff");
    const base = baseAssembly ?? this.emptyAssembly(assemblyId);
    const diff = this.diffEngine.diffAssemblies(
      base,
      currentAssembly,
      baseVersion,
      currentVersion,
    );

    // ── Stage 2: Change Graph ────────────────────────────────────────────
    stages.push("graph");
    const graph: ChangeGraph = this.graphBuilder.buildChangeGraph(diff);

    // ── Stage 3: Impact Analysis ─────────────────────────────────────────
    stages.push("impact");
    const analysis = this.impactAnalyzer.analyzeImpact(diff, graph);

    // ── Stage 4: Governance ──────────────────────────────────────────────
    stages.push("governance");
    const decision = this.governanceEngine.evaluatePolicies(analysis);

    // ── Stage 5: Decision ────────────────────────────────────────────────
    stages.push("decision");
    let pipelineStatus: CIResult["pipelineStatus"];
    if (decision.status === "BLOCK") {
      pipelineStatus = "BLOCKED";
    } else if (decision.status === "WARN") {
      pipelineStatus = "PASSED"; // Warnings don't block, only inform
    } else {
      pipelineStatus = "PASSED";
    }

    const result: CIResult = {
      assemblyId,
      version: currentVersion,
      decision,
      pipelineStatus,
      executedStages: stages,
      analysis,
      diff,
      timestamp: new Date(),
    };

    // ── Emit events ──────────────────────────────────────────────────────
    if (this.events) {
      await this.emit("assembly.governance.decision", assemblyId, {
        status: decision.status,
        score: decision.finalScore,
        triggeredRules: decision.triggeredRules.length,
        reasons: decision.reasons,
      });

      if (pipelineStatus === "BLOCKED") {
        await this.emit("assembly.ci.blocked", assemblyId, {
          version: currentVersion,
          score: decision.finalScore,
          blockers: decision.triggeredRules
            .filter((r) => r.action === "block")
            .map((r) => r.name),
        });
      } else {
        await this.emit("assembly.ci.passed", assemblyId, {
          version: currentVersion,
          score: decision.finalScore,
          status: decision.status,
        });
      }
    }

    console.log(
      `[CI/CD] Pipeline ${pipelineStatus} | Assembly: ${assemblyId} | Version: ${currentVersion} | ` +
        `Decision: ${decision.status} | Score: ${decision.finalScore} | Stages: ${stages.join(" → ")}`,
    );

    return result;
  }

  private emptyAssembly(id: string): ProjectAssembly {
    return {
      id,
      generationId: "",
      schemaVersion: "1.0.0",
      createdAt: new Date(),
      status: "complete",
      services: [],
      folders: [],
      scripts: [],
      modules: [],
      ui: [],
      world: [],
      assets: [],
      network: [],
      configuration: [],
      build: {
        totalServices: 0,
        totalFolders: 0,
        totalScripts: 0,
        totalModules: 0,
        totalAssets: 0,
        totalNetworkObjects: 0,
        totalWorkspaceEntries: 0,
        totalConfigurations: 0,
        buildTimeMs: 0,
      },
    };
  }

  private async emit(
    type: string,
    pipelineId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (this.events) {
      await this.events.emit({
        type: type as PipelineEvent["type"],
        pipelineId,
        data,
        timestamp: new Date(),
      });
    }
  }
}
