import type { GameBlueprint } from "../generation/GenerationBlueprint";
import type { ProjectAssembly } from "../assembly/AssemblyTypes";
import type { AssemblyDiff } from "../assembly/AssemblyDiffEngine";
import type { ImpactAnalysis } from "../assembly/AssemblyImpactAnalyzer";
import type { ReplayResult } from "../assembly/AssemblyReplayEngine";
import type { CIResult } from "../governance/CIControlPipeline";
import type { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../execution/pipelineTypes";

import { AssemblyBuilder } from "../assembly/AssemblyBuilder";
import {
  AssemblyRegistry,
  getDefaultAssemblyRegistry,
} from "../assembly/AssemblyRegistry";
import { CIControlPipeline } from "../governance/CIControlPipeline";
import { ExecutionGuard, type CompilerStage } from "./ExecutionGuard";
import {
  CompilerErrorBoundary,
  type CompilerError,
} from "./CompilerErrorBoundary";
import { CompilerTelemetry, getCompilerTelemetry } from "./CompilerTelemetry";

/**
 * BuildResult — normalized output of the build pipeline.
 */
export interface BuildResult {
  success: boolean;
  assemblyId?: string;
  version?: string;
  assembly?: ProjectAssembly;
  ciResult?: CIResult;
  error?: CompilerError;
  stages: string[];
  durationMs: number;
}

/**
 * CompilerOrchestrator
 *
 * Central internal execution coordinator.
 * Manages: stage execution, error isolation, retry boundaries, telemetry.
 *
 * Pipeline: API → Orchestrator → ExecutionGuard → Internal stages → Result
 *
 * Internal stages: map → assemble → build → validate → persist → (diff → impact → governance)
 */
export class CompilerOrchestrator {
  private registry: AssemblyRegistry;
  private assemblyBuilder: AssemblyBuilder;
  private ciPipeline: CIControlPipeline;
  private telemetry: CompilerTelemetry;

  constructor(private readonly events: PipelineEventEmitter) {
    this.registry = getDefaultAssemblyRegistry();
    this.assemblyBuilder = new AssemblyBuilder(events);
    this.ciPipeline = new CIControlPipeline(events);
    this.telemetry = getCompilerTelemetry();
  }

  /**
   * Execute a full build from a GameBlueprint.
   * Stages: map → assemble → build → validate → persist → (CI if previous version exists)
   */
  async build(blueprint: GameBlueprint): Promise<BuildResult> {
    const buildStart = Date.now();
    const guard = new ExecutionGuard();
    const stages: string[] = [];

    await this.emit("compiler.build.started", blueprint.id, {
      blueprintId: blueprint.id,
    });

    // ── Assembly Build (map → assemble → build → validate) ──────────────
    const buildResult = await CompilerErrorBoundary.safe(
      () => this.assemblyBuilder.build(blueprint),
      "build",
    );

    if (!buildResult.success) {
      this.telemetry.recordBuild(Date.now() - buildStart, false);
      await this.emit("compiler.build.failed", blueprint.id, {
        error: buildResult.error.message,
      });
      return {
        success: false,
        error: buildResult.error,
        stages,
        durationMs: Date.now() - buildStart,
      };
    }

    const assembly = buildResult.data;
    stages.push("map", "assemble", "build", "validate", "persist");
    guard.markCompleted("map");
    guard.markCompleted("assemble");
    guard.markCompleted("build");
    guard.markCompleted("validate");
    guard.markCompleted("persist");

    this.telemetry.recordStage("build", Date.now() - buildStart, true);

    // ── CI Pipeline (diff → impact → governance) if previous version exists ──
    let ciResult: CIResult | undefined;
    const versions = this.registry.listVersions(assembly.id);

    if (versions.length >= 2) {
      const ciStart = Date.now();
      const fromVersion = versions[versions.length - 2];
      const toVersion = versions[versions.length - 1];

      // Guard checks
      guard.markCompleted("diff");
      guard.markCompleted("impact");

      const governanceGuard = guard.canExecute("governance");
      if (!governanceGuard) {
        guard.markCompleted("governance");
        stages.push("diff", "impact", "governance");

        const prevAssembly = this.registry.getVersion(assembly.id, fromVersion);
        const ciRunResult = await CompilerErrorBoundary.safe(
          () =>
            this.ciPipeline.processBuild(
              assembly,
              prevAssembly,
              toVersion,
              fromVersion,
            ),
          "governance",
        );

        if (ciRunResult.success) {
          ciResult = ciRunResult.data;
          this.telemetry.recordStage("governance", Date.now() - ciStart, true);
          if (ciResult.pipelineStatus === "BLOCKED") {
            this.telemetry.recordCIBlock();
          } else {
            this.telemetry.recordCIPass();
          }
        } else {
          this.telemetry.recordStage("governance", Date.now() - ciStart, false);
          await this.emit("compiler.stage.error", blueprint.id, {
            stage: "governance",
            error: ciRunResult.error.message,
          });
        }
      }
    }

    const durationMs = Date.now() - buildStart;
    this.telemetry.recordBuild(durationMs, true);

    const version = versions.at(-1) ?? "1.0.1";

    await this.emit("compiler.build.completed", blueprint.id, {
      assemblyId: assembly.id,
      version,
      status: ciResult?.pipelineStatus ?? "PASSED",
      durationMs,
    });

    return {
      success: true,
      assemblyId: assembly.id,
      version,
      assembly,
      ciResult,
      stages,
      durationMs,
    };
  }

  /**
   * Replay a stored assembly version.
   */
  async replay(
    assemblyId: string,
    version: string,
    blueprint: GameBlueprint,
  ): Promise<ReplayResult | { success: false; error: CompilerError }> {
    this.telemetry.recordReplay();
    const result = await CompilerErrorBoundary.safe(
      async () => this.registry.getReplay(assemblyId, version, blueprint),
      "replay",
    );
    if (!result.success) return result;
    this.telemetry.recordStage("replay", result.data.totalDurationMs, true);
    return result.data;
  }

  /**
   * Compute structural diff between two versions.
   */
  diff(
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): AssemblyDiff | { success: false; error: CompilerError } {
    this.telemetry.recordDiff();
    const result = CompilerErrorBoundary.safeSync(() => {
      const d = this.registry.getDiff(assemblyId, fromVersion, toVersion);
      if (!d)
        throw new Error(
          `Cannot diff: versions ${fromVersion} or ${toVersion} not found for ${assemblyId}`,
        );
      return d;
    }, "diff");
    if (!result.success) return result;
    this.telemetry.recordStage("diff", 0, true);
    return result.data;
  }

  /**
   * Compute impact analysis between two versions.
   */
  impact(
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): ImpactAnalysis | { success: false; error: CompilerError } {
    const result = CompilerErrorBoundary.safeSync(() => {
      const a = this.registry.getImpactAnalysis(
        assemblyId,
        fromVersion,
        toVersion,
      );
      if (!a)
        throw new Error(
          `Cannot analyze impact: versions not found for ${assemblyId}`,
        );
      return a;
    }, "impact");
    if (!result.success) return result;
    this.telemetry.recordStage("impact", 0, true);
    return result.data;
  }

  /**
   * Run CI governance check between two versions.
   */
  async runCI(
    assemblyId: string,
    currentVersion: string,
  ): Promise<CIResult | { success: false; error: CompilerError }> {
    const versions = this.registry.listVersions(assemblyId);
    if (versions.length < 2) {
      // First build — auto-pass
      return {
        assemblyId,
        version: currentVersion,
        decision: {
          assemblyId,
          status: "ALLOW",
          triggeredRules: [],
          finalScore: 0,
          reasons: [],
          recommendedAction: "First build — no previous version to compare.",
          evaluatedAt: new Date(),
        },
        pipelineStatus: "PASSED",
        executedStages: ["first-build-pass"],
        timestamp: new Date(),
      };
    }

    const fromVersion = versions[versions.length - 2];
    const current = this.registry.get(assemblyId);
    const prev = this.registry.getVersion(assemblyId, fromVersion);

    if (!current || !prev) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Assembly versions not found"),
          "ci",
        ),
      };
    }

    const result = await CompilerErrorBoundary.safe(
      () =>
        this.ciPipeline.processBuild(
          current,
          prev,
          currentVersion,
          fromVersion,
        ),
      "ci",
    );
    if (!result.success) return result;
    return result.data;
  }

  /**
   * Get telemetry summary.
   */
  getTelemetry() {
    return this.telemetry.getSummary();
  }

  private async emit(
    type: string,
    pipelineId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.events.emit({
      type: type as PipelineEvent["type"],
      pipelineId,
      data,
      timestamp: new Date(),
    });
  }
}
