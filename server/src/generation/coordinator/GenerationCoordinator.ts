/**
 * GenerationCoordinator.ts
 *
 * Top-level coordinator that connects all pipeline components into
 * a complete generation workflow:
 *   Job → Session → Context → Planning → Execution → Artifacts → Package
 *
 * Orchestrates existing services only. Does NOT redesign architecture.
 */

import { PlannerEngine } from "../../planning/core/PlannerEngine";
import { PlanExecutor } from "../../planning/execution/PlanExecutor";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { ArtifactAssembler } from "./ArtifactAssembler";
import { GenerationPackageBuilder } from "./GenerationPackageBuilder";
import { PipelineIntegrityValidator } from "./PipelineIntegrityValidator";
import { ProjectStructureValidator } from "./ProjectStructureValidator";
import { GenerationContextBuilder } from "./GenerationContext";
import type {
  GenerationPackage,
  GenerationMetrics,
  GenerationSession,
} from "./types";
import { createSessionId } from "./types";

export interface GenerationRequest {
  jobId: string;
  intent: string;
  constraints: string[];
  projectId: string;
  metadata?: Record<string, unknown>;
}

export interface GenerationResult {
  success: boolean;
  session: GenerationSession;
  package?: GenerationPackage;
  metrics: GenerationMetrics;
  error?: string;
}

export class GenerationCoordinator {
  private agentRegistry: AgentRegistry;
  private assembler: ArtifactAssembler;
  private packageBuilder: GenerationPackageBuilder;
  private integrityValidator: PipelineIntegrityValidator;
  private structureValidator: ProjectStructureValidator;

  constructor(agentRegistry: AgentRegistry) {
    this.agentRegistry = agentRegistry;
    this.assembler = new ArtifactAssembler();
    this.packageBuilder = new GenerationPackageBuilder();
    this.integrityValidator = new PipelineIntegrityValidator();
    this.structureValidator = new ProjectStructureValidator();
  }

  /**
   * Execute a complete generation pipeline.
   */
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const totalStart = Date.now();
    const session: GenerationSession = {
      sessionId: createSessionId(),
      jobId: request.jobId,
      intent: request.intent,
      constraints: request.constraints,
      projectId: request.projectId,
      createdAt: Date.now(),
      status: "active",
    };

    const ctx = GenerationContextBuilder.create({
      jobId: request.jobId,
      projectId: request.projectId,
      intent: request.intent,
      constraints: request.constraints,
      metadata: request.metadata,
    });

    const metrics: GenerationMetrics = {
      planningDurationMs: 0,
      executionDurationMs: 0,
      artifactDurationMs: 0,
      validationDurationMs: 0,
      totalDurationMs: 0,
      agentCallCount: 0,
      artifactCount: 0,
      packageSizeBytes: 0,
    };

    try {
      // ── STAGE 1: PLANNING ──────────────────────────────────────────────
      GenerationContextBuilder.beginStage(ctx, "planning");
      const planStart = Date.now();

      const planner = new PlannerEngine();
      const plan = planner.createPlan({
        intent: request.intent,
        constraints: request.constraints,
        projectId: request.projectId,
        context: request.metadata,
      });
      ctx.planId = plan.planId;

      metrics.planningDurationMs = Date.now() - planStart;
      GenerationContextBuilder.completeStage(ctx, "planning", {
        planId: plan.planId,
        estimatedSteps: plan.estimatedSteps,
      });

      // ── STAGE 2: EXECUTION ─────────────────────────────────────────────
      GenerationContextBuilder.beginStage(ctx, "execution");
      const execStart = Date.now();

      const executor = new PlanExecutor();
      const planResult = await executor.executePlan(
        plan.planId,
        plan.graph,
        (agentType, input) => {
          metrics.agentCallCount++;
          return this.agentRegistry.executeAgent(agentType, input);
        },
        { projectId: request.projectId, stopOnFailure: false },
      );

      metrics.executionDurationMs = Date.now() - execStart;

      if (!planResult.success) {
        GenerationContextBuilder.failStage(
          ctx,
          "execution",
          `${planResult.failedNodes} node(s) failed`,
        );
      } else {
        GenerationContextBuilder.completeStage(
          ctx,
          "execution",
          planResult.outputs,
        );
      }

      // Merge plan outputs into context
      for (const [key, value] of Object.entries(planResult.outputs)) {
        ctx.outputs[key] = value;
      }

      // ── STAGE 3: ARTIFACT ASSEMBLY ─────────────────────────────────────
      GenerationContextBuilder.beginStage(ctx, "artifact-assembly");
      const artStart = Date.now();

      const assemblyResult = this.assembler.assemble(ctx);
      metrics.artifactDurationMs = Date.now() - artStart;
      metrics.artifactCount = assemblyResult.artifacts.length;

      if (assemblyResult.valid) {
        GenerationContextBuilder.completeStage(ctx, "artifact-assembly", {
          count: assemblyResult.artifacts.length,
        });
      } else {
        GenerationContextBuilder.failStage(
          ctx,
          "artifact-assembly",
          assemblyResult.errors.join("; "),
        );
      }

      // ── STAGE 4: VALIDATION ────────────────────────────────────────────
      GenerationContextBuilder.beginStage(ctx, "validation");
      const valStart = Date.now();

      const integrityReport = this.integrityValidator.validate(
        ctx,
        assemblyResult.artifacts,
      );
      metrics.validationDurationMs = Date.now() - valStart;

      GenerationContextBuilder.completeStage(
        ctx,
        "validation",
        integrityReport,
      );

      // ── BUILD PACKAGE ──────────────────────────────────────────────────
      const pkg = this.packageBuilder.build(ctx, assemblyResult.artifacts);
      metrics.packageSizeBytes = pkg.totalSizeBytes;

      // Structure validation
      const structureResult = this.structureValidator.validate(pkg);

      metrics.totalDurationMs = Date.now() - totalStart;
      session.completedAt = Date.now();
      session.status = "completed";

      return {
        success:
          structureResult.valid &&
          (planResult.success || planResult.completedNodes > 0),
        session,
        package: pkg,
        metrics,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      metrics.totalDurationMs = Date.now() - totalStart;
      session.completedAt = Date.now();
      session.status = "failed";

      return { success: false, session, metrics, error };
    }
  }
}
