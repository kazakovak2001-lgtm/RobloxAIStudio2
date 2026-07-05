/**
 * ProjectMemory.ts
 *
 * Per-execution mutable memory object.
 * Holds the ProjectContext, decision history, execution records, and snapshots.
 * This is what agents interact with via MemoryManager.
 */

import type {
  ProjectContext,
  ArchitecturalDecision,
  AgentExecutionRecord,
  MemorySnapshot,
  DecisionCategory,
  DecisionStatus,
  EvaluationSummaryContext,
} from "./MemoryTypes";
import { MemorySerializer } from "./MemorySerializer";
import { mergeContextUpdate } from "./ProjectContext";

export class ProjectMemory {
  private context: ProjectContext;
  private decisions: ArchitecturalDecision[] = [];
  private executions: AgentExecutionRecord[] = [];
  private snapshots: MemorySnapshot[] = [];
  private snapshotCounter = 0;
  private decisionCounter = 0;

  readonly executionId: string;

  constructor(initialContext: ProjectContext) {
    this.context = initialContext;
    this.executionId = initialContext.pipeline.executionId;
  }

  // ─── Context read / write ──────────────────────────────────────────────────

  /**
   * Read the current context (returns a clone to prevent accidental mutation).
   */
  readContext(): Readonly<ProjectContext> {
    return this.context;
  }

  /**
   * Merge a partial update into the current context.
   * Logs the update.
   */
  writeContext(
    update: Parameters<typeof mergeContextUpdate>[1],
    agentName: string,
    section: string,
  ): void {
    this.context = mergeContextUpdate(this.context, update);
    console.log(
      `[MEMORY] Context Updated | Section: ${section} | Agent: ${agentName}`,
    );
  }

  /**
   * Mark a pipeline step as completed in the context metadata.
   */
  markStepCompleted(stepId: string): void {
    if (!this.context.pipeline.completedSteps.includes(stepId)) {
      this.context.pipeline.completedSteps.push(stepId);
    }
  }

  /**
   * Mark a pipeline step as failed in the context metadata.
   */
  markStepFailed(stepId: string): void {
    this.context.pipeline.failedStep = stepId;
  }

  /**
   * Update the evaluation summary in the context.
   */
  updateEvaluation(summary: EvaluationSummaryContext, agentName: string): void {
    this.writeContext({ evaluation: summary }, agentName, "Evaluation");
  }

  // ─── Decisions ─────────────────────────────────────────────────────────────

  /**
   * Append an architectural decision.
   */
  appendDecision(
    agent: string,
    category: DecisionCategory,
    summary: string,
    details: string,
    reason: string,
    impact: string,
    status: DecisionStatus = "accepted",
  ): ArchitecturalDecision {
    this.decisionCounter++;
    const decision: ArchitecturalDecision = {
      id: `decision-${this.executionId}-${this.decisionCounter}`,
      agent,
      timestamp: new Date(),
      category,
      summary,
      details,
      reason,
      impact,
      status,
    };
    this.decisions.push(decision);
    console.log(
      `[MEMORY] Decision Added | Category: ${category} | Agent: ${agent} | Summary: ${summary}`,
    );
    return decision;
  }

  /** Read all decisions (immutable view). */
  getDecisions(): ReadonlyArray<ArchitecturalDecision> {
    return this.decisions;
  }

  // ─── Warnings / Recommendations ────────────────────────────────────────────

  appendWarning(message: string, agentName: string): void {
    this.context.warnings.push(`[${agentName}] ${message}`);
  }

  appendRecommendation(message: string, agentName: string): void {
    this.context.recommendations.push(`[${agentName}] ${message}`);
  }

  // ─── Execution records ─────────────────────────────────────────────────────

  recordAgentExecution(record: AgentExecutionRecord): void {
    this.executions.push(record);
  }

  getExecutionHistory(): ReadonlyArray<AgentExecutionRecord> {
    return this.executions;
  }

  // ─── Snapshots ─────────────────────────────────────────────────────────────

  /**
   * Create a lightweight in-memory snapshot of the current state.
   */
  takeSnapshot(pipelineStep: string): MemorySnapshot {
    this.snapshotCounter++;
    const snapshot: MemorySnapshot = {
      id: `snap-${this.executionId}-${this.snapshotCounter}`,
      snapshotNumber: this.snapshotCounter,
      pipelineStep,
      context: MemorySerializer.clone(this.context),
      decisions: MemorySerializer.clone(this.decisions),
      evaluationSummary: this.context.evaluation
        ? MemorySerializer.clone(this.context.evaluation)
        : undefined,
      timestamp: new Date(),
    };
    this.snapshots.push(snapshot);
    console.log(
      `[MEMORY] Snapshot #${this.snapshotCounter} created | Step: ${pipelineStep} | Decisions: ${this.decisions.length}`,
    );
    return snapshot;
  }

  getSnapshots(): ReadonlyArray<MemorySnapshot> {
    return this.snapshots;
  }

  /**
   * Restore context from a snapshot (does not remove newer snapshots).
   */
  restoreSnapshot(snapshotId: string): boolean {
    const snap = this.snapshots.find((s) => s.id === snapshotId);
    if (!snap) return false;
    this.context = MemorySerializer.clone(snap.context);
    this.decisions = MemorySerializer.clone(snap.decisions);
    console.log(
      `[MEMORY] Snapshot restored | ID: ${snapshotId} | Step: ${snap.pipelineStep}`,
    );
    return true;
  }

  getLatestSnapshot(): MemorySnapshot | null {
    return this.snapshots.at(-1) ?? null;
  }

  /** Summary suitable for logging / status endpoints. */
  getSummary() {
    return {
      executionId: this.executionId,
      completedSteps: this.context.pipeline.completedSteps,
      failedStep: this.context.pipeline.failedStep,
      decisions: this.decisions.length,
      snapshots: this.snapshots.length,
      executions: this.executions.length,
      warnings: this.context.warnings.length,
      recommendations: this.context.recommendations.length,
    };
  }
}
