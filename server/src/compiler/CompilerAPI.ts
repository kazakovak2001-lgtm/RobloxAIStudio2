import type { GameBlueprint } from "../generation/GenerationBlueprint";
import type { BuildResult } from "./CompilerOrchestrator";
import type { ReplayResult } from "../assembly/AssemblyReplayEngine";
import type { AssemblyDiff } from "../assembly/AssemblyDiffEngine";
import type { ImpactAnalysis } from "../assembly/AssemblyImpactAnalyzer";
import type { CIResult } from "../governance/CIControlPipeline";
import type { CompilerError } from "./CompilerErrorBoundary";
import type { CompilerTelemetrySummary } from "./CompilerTelemetry";
import type { PipelineEventEmitter } from "../socket/streaming";

import { CompilerOrchestrator } from "./CompilerOrchestrator";
import { CompilerErrorBoundary } from "./CompilerErrorBoundary";

/**
 * Normalized API response — all operations return this shape.
 */
export type CompilerResponse<T> =
  { success: true; data: T } | { success: false; error: CompilerError };

/**
 * CompilerAPI
 *
 * PUBLIC-FACING LAYER — single stable entrypoint for all external operations.
 *
 * Rules:
 *  - Contains NO business logic
 *  - Only delegates to CompilerOrchestrator
 *  - Enforces input validation boundary
 *  - Normalizes all outputs into CompilerResponse<T>
 *
 * This is the ONLY class external consumers should interact with.
 */
export class CompilerAPI {
  private orchestrator: CompilerOrchestrator;

  constructor(events: PipelineEventEmitter) {
    this.orchestrator = new CompilerOrchestrator(events);
  }

  // ─── Build ─────────────────────────────────────────────────────────────────

  /**
   * Build an assembly from a GameBlueprint.
   * Full pipeline: map → assemble → build → validate → persist → CI
   */
  async buildAssembly(blueprint: GameBlueprint): CompilerResponse<BuildResult> {
    // Input validation
    if (!blueprint || !blueprint.id) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Invalid blueprint: missing 'id' field"),
          "input-validation",
          "ValidationError",
        ),
      };
    }

    if (!blueprint.schemaVersion) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Invalid blueprint: missing 'schemaVersion' field"),
          "input-validation",
          "ValidationError",
        ),
      };
    }

    try {
      const result = await this.orchestrator.build(blueprint);
      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(err, "build"),
      };
    }
  }

  // ─── Replay ────────────────────────────────────────────────────────────────

  /**
   * Replay a stored assembly version deterministically.
   */
  async replayAssembly(
    assemblyId: string,
    version: string,
    blueprint: GameBlueprint,
  ): CompilerResponse<ReplayResult> {
    if (!assemblyId || !version) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Missing assemblyId or version"),
          "input-validation",
          "ValidationError",
        ),
      };
    }

    const result = await this.orchestrator.replay(
      assemblyId,
      version,
      blueprint,
    );
    if ("success" in result && result.success === false) {
      return result;
    }
    return { success: true, data: result as ReplayResult };
  }

  // ─── Diff ──────────────────────────────────────────────────────────────────

  /**
   * Compute structural diff between two assembly versions.
   */
  diffAssemblies(
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): CompilerResponse<AssemblyDiff> {
    if (!assemblyId || !fromVersion || !toVersion) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Missing assemblyId, fromVersion, or toVersion"),
          "input-validation",
          "ValidationError",
        ),
      };
    }

    const result = this.orchestrator.diff(assemblyId, fromVersion, toVersion);
    if ("success" in result && result.success === false) {
      return result;
    }
    return { success: true, data: result as AssemblyDiff };
  }

  // ─── Impact ────────────────────────────────────────────────────────────────

  /**
   * Analyze structural impact between two assembly versions.
   */
  analyzeImpact(
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): CompilerResponse<ImpactAnalysis> {
    if (!assemblyId || !fromVersion || !toVersion) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Missing assemblyId, fromVersion, or toVersion"),
          "input-validation",
          "ValidationError",
        ),
      };
    }

    const result = this.orchestrator.impact(assemblyId, fromVersion, toVersion);
    if ("success" in result && result.success === false) {
      return result;
    }
    return { success: true, data: result as ImpactAnalysis };
  }

  // ─── CI/CD ─────────────────────────────────────────────────────────────────

  /**
   * Run CI governance check for an assembly version.
   */
  async runCI(assemblyId: string, version: string): CompilerResponse<CIResult> {
    if (!assemblyId || !version) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Missing assemblyId or version"),
          "input-validation",
          "ValidationError",
        ),
      };
    }

    const result = await this.orchestrator.runCI(assemblyId, version);
    if ("success" in result && result.success === false) {
      return result;
    }
    return { success: true, data: result as CIResult };
  }

  // ─── Telemetry ─────────────────────────────────────────────────────────────

  /**
   * Get production telemetry summary.
   */
  getTelemetry(): CompilerTelemetrySummary {
    return this.orchestrator.getTelemetry();
  }
}
