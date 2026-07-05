import type { GameBlueprint } from "../generation/GenerationBlueprint";
import type { ProjectAssembly } from "../assembly/AssemblyTypes";
import type { ReplayResult } from "../assembly/AssemblyReplayEngine";
import type { AssemblyDiff } from "../assembly/AssemblyDiffEngine";
import type { ImpactAnalysis } from "../assembly/AssemblyImpactAnalyzer";
import type { CIResult } from "../governance/CIControlPipeline";
import type { CompilerError } from "./CompilerErrorBoundary";
import type { CompilerTelemetrySummary } from "./CompilerTelemetry";
import type { Project, ProjectConfig } from "./ProjectRegistry";
import type { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../execution/pipelineTypes";

import { CompilerErrorBoundary } from "./CompilerErrorBoundary";
import { ProjectRegistry, getProjectRegistry } from "./ProjectRegistry";
import { CompilerContextManager } from "./CompilerContextManager";
import { ProjectIsolationLayer } from "./ProjectIsolationLayer";
import { ExecutionGuard } from "./ExecutionGuard";

/**
 * Normalized API response — all operations return this shape.
 */
export type CompilerResponse<T> =
  { success: true; data: T } | { success: false; error: CompilerError };

/**
 * BuildResult — normalized output of a build operation.
 */
export interface BuildResult {
  success: boolean;
  projectId: string;
  assemblyId?: string;
  version?: string;
  assembly?: ProjectAssembly;
  ciResult?: CIResult;
  error?: CompilerError;
  stages: string[];
  durationMs: number;
}

/**
 * CompilerAPI
 *
 * PUBLIC-FACING LAYER — single stable entrypoint for all external operations.
 * All operations are PROJECT-SCOPED via required projectId parameter.
 *
 * Rules:
 *  - Contains NO business logic
 *  - Delegates through ProjectIsolationLayer → CompilerContext → Internal services
 *  - Enforces input validation boundary
 *  - Normalizes all outputs into CompilerResponse<T>
 */
export class CompilerAPI {
  private projectRegistry: ProjectRegistry;
  private contextManager: CompilerContextManager;
  private isolation: ProjectIsolationLayer;

  constructor(private readonly events: PipelineEventEmitter) {
    this.projectRegistry = getProjectRegistry();
    this.contextManager = new CompilerContextManager(events);
    this.isolation = new ProjectIsolationLayer(
      this.projectRegistry,
      this.contextManager,
    );
  }

  // ─── Project Management ────────────────────────────────────────────────────

  createProject(config: ProjectConfig): CompilerResponse<Project> {
    if (!config.name || config.name.trim().length === 0) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Project name is required"),
          "input-validation",
          "ValidationError",
        ),
      };
    }
    const project = this.projectRegistry.createProject(config);
    this.contextManager.createContext(project.projectId, project.storageRoot);
    this.emitSync("project.created", project.projectId, {
      projectId: project.projectId,
      name: project.name,
    });
    return { success: true, data: project };
  }

  getProject(projectId: string): CompilerResponse<Project> {
    const project = this.projectRegistry.getProject(projectId);
    if (!project)
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error(`Project "${projectId}" not found`),
          "lookup",
          "ValidationError",
        ),
      };
    return { success: true, data: project };
  }

  listProjects(): Project[] {
    return this.projectRegistry.listProjects();
  }

  deleteProject(projectId: string): CompilerResponse<{ deleted: boolean }> {
    const deleted = this.projectRegistry.deleteProject(projectId);
    if (deleted) {
      this.contextManager.destroyContext(projectId);
      this.emitSync("project.deleted", projectId, { projectId });
    }
    return { success: true, data: { deleted } };
  }

  // ─── Build ─────────────────────────────────────────────────────────────────

  async buildAssembly(
    projectId: string,
    blueprint: GameBlueprint,
  ): Promise<CompilerResponse<BuildResult>> {
    const check = this.isolation.resolveContext(projectId);
    if (!check.allowed) return { success: false, error: check.error };

    if (!blueprint?.id || !blueprint?.schemaVersion) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Invalid blueprint: missing id or schemaVersion"),
          "input-validation",
          "ValidationError",
        ),
      };
    }

    const ctx = check.context;
    const buildStart = Date.now();
    const guard = new ExecutionGuard();
    const stages: string[] = [];

    await this.emit("compiler.build.started", projectId, {
      projectId,
      blueprintId: blueprint.id,
    });

    const buildResult = await CompilerErrorBoundary.safe(
      () => ctx.assemblyBuilder.build(blueprint),
      "build",
    );

    if (!buildResult.success) {
      ctx.telemetry.recordBuild(Date.now() - buildStart, false);
      await this.emit("compiler.build.failed", projectId, {
        projectId,
        error: buildResult.error.message,
      });
      return { success: false, error: buildResult.error };
    }

    const assembly = buildResult.data;
    stages.push("map", "assemble", "build", "validate", "persist");
    guard.markCompleted("map");
    guard.markCompleted("assemble");
    guard.markCompleted("build");
    guard.markCompleted("validate");
    guard.markCompleted("persist");
    ctx.telemetry.recordStage("build", Date.now() - buildStart, true);

    // CI check if previous version exists
    let ciResult: CIResult | undefined;
    const versions = ctx.assemblyRegistry.listVersions(assembly.id);
    if (versions.length >= 2) {
      const from = versions[versions.length - 2];
      const to = versions[versions.length - 1];
      const prev = ctx.assemblyRegistry.getVersion(assembly.id, from);
      stages.push("diff", "impact", "governance");

      const ciRun = await CompilerErrorBoundary.safe(
        () => ctx.ciPipeline.processBuild(assembly, prev, to, from),
        "governance",
      );
      if (ciRun.success) {
        ciResult = ciRun.data;
        if (ciResult.pipelineStatus === "BLOCKED")
          ctx.telemetry.recordCIBlock();
        else ctx.telemetry.recordCIPass();
      }
    }

    const durationMs = Date.now() - buildStart;
    ctx.telemetry.recordBuild(durationMs, true);

    await this.emit("compiler.build.completed", projectId, {
      projectId,
      assemblyId: assembly.id,
      version: versions.at(-1) ?? "1.0.1",
      durationMs,
    });

    return {
      success: true,
      data: {
        success: true,
        projectId,
        assemblyId: assembly.id,
        version: versions.at(-1) ?? "1.0.1",
        assembly,
        ciResult,
        stages,
        durationMs,
      },
    };
  }

  // ─── Replay ────────────────────────────────────────────────────────────────

  async replayAssembly(
    projectId: string,
    assemblyId: string,
    version: string,
    blueprint: GameBlueprint,
  ): Promise<CompilerResponse<ReplayResult>> {
    const check = this.isolation.resolveContext(projectId);
    if (!check.allowed) return { success: false, error: check.error };

    const result = CompilerErrorBoundary.safeSync(
      () =>
        check.context.assemblyRegistry.getReplay(
          assemblyId,
          version,
          blueprint,
        ),
      "replay",
    );
    if (!result.success) return result;
    check.context.telemetry.recordReplay();
    return { success: true, data: result.data };
  }

  // ─── Diff ──────────────────────────────────────────────────────────────────

  diffAssemblies(
    projectId: string,
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): CompilerResponse<AssemblyDiff> {
    const check = this.isolation.resolveContext(projectId);
    if (!check.allowed) return { success: false, error: check.error };

    const diff = check.context.assemblyRegistry.getDiff(
      assemblyId,
      fromVersion,
      toVersion,
    );
    if (!diff)
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Versions not found"),
          "diff",
          "ValidationError",
        ),
      };
    check.context.telemetry.recordDiff();
    return { success: true, data: diff };
  }

  // ─── Impact ────────────────────────────────────────────────────────────────

  analyzeImpact(
    projectId: string,
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): CompilerResponse<ImpactAnalysis> {
    const check = this.isolation.resolveContext(projectId);
    if (!check.allowed) return { success: false, error: check.error };

    const analysis = check.context.assemblyRegistry.getImpactAnalysis(
      assemblyId,
      fromVersion,
      toVersion,
    );
    if (!analysis)
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Cannot compute impact"),
          "impact",
          "ValidationError",
        ),
      };
    return { success: true, data: analysis };
  }

  // ─── CI/CD ─────────────────────────────────────────────────────────────────

  async runCI(
    projectId: string,
    assemblyId: string,
    version: string,
  ): Promise<CompilerResponse<CIResult>> {
    const check = this.isolation.resolveContext(projectId);
    if (!check.allowed) return { success: false, error: check.error };

    const versions = check.context.assemblyRegistry.listVersions(assemblyId);
    if (versions.length < 2) {
      return {
        success: true,
        data: {
          assemblyId,
          version,
          decision: {
            assemblyId,
            status: "ALLOW",
            triggeredRules: [],
            finalScore: 0,
            reasons: [],
            recommendedAction: "First build",
            evaluatedAt: new Date(),
          },
          pipelineStatus: "PASSED",
          executedStages: ["first-build"],
          timestamp: new Date(),
        },
      };
    }
    const from = versions[versions.length - 2];
    const current = check.context.assemblyRegistry.get(assemblyId);
    const prev = check.context.assemblyRegistry.getVersion(assemblyId, from);
    if (!current || !prev)
      return {
        success: false,
        error: CompilerErrorBoundary.capture(
          new Error("Assembly not found"),
          "ci",
          "ValidationError",
        ),
      };

    const result = await CompilerErrorBoundary.safe(
      () => check.context.ciPipeline.processBuild(current, prev, version, from),
      "ci",
    );
    if (!result.success) return result;
    return { success: true, data: result.data };
  }

  // ─── Telemetry ─────────────────────────────────────────────────────────────

  getTelemetry(projectId: string): CompilerResponse<CompilerTelemetrySummary> {
    const check = this.isolation.resolveContext(projectId);
    if (!check.allowed) return { success: false, error: check.error };
    return { success: true, data: check.context.telemetry.getSummary() };
  }

  getGlobalTelemetry(): Record<string, CompilerTelemetrySummary> {
    return this.contextManager.getGlobalTelemetry();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

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

  private emitSync(
    type: string,
    pipelineId: string,
    data: Record<string, unknown>,
  ): void {
    void this.events.emit({
      type: type as PipelineEvent["type"],
      pipelineId,
      data,
      timestamp: new Date(),
    });
  }
}
