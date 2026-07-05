/**
 * ExecutionGuard.ts
 *
 * System-level safety layer that enforces execution order rules
 * and prevents invalid pipeline transitions.
 *
 * Rules:
 *  - Cannot run impact before diff exists
 *  - Cannot run governance before impact
 *  - Cannot persist invalid assembly state
 *  - Cannot diff without two valid versions
 *  - Stages must execute in declared order
 */

export type CompilerStage =
  | "map"
  | "assemble"
  | "build"
  | "validate"
  | "persist"
  | "diff"
  | "impact"
  | "governance";

const STAGE_ORDER: CompilerStage[] = [
  "map",
  "assemble",
  "build",
  "validate",
  "persist",
  "diff",
  "impact",
  "governance",
];

export interface GuardViolation {
  stage: CompilerStage;
  rule: string;
  message: string;
}

export class ExecutionGuard {
  private completedStages = new Set<CompilerStage>();

  /**
   * Check if a stage is allowed to execute given current state.
   * Returns null if allowed, or a GuardViolation if blocked.
   */
  canExecute(stage: CompilerStage): GuardViolation | null {
    switch (stage) {
      case "diff":
        // Diff requires at least persist to have completed (two versions exist)
        if (!this.completedStages.has("persist")) {
          return {
            stage,
            rule: "REQUIRES_PERSIST",
            message: "Cannot run diff: no persisted assembly exists",
          };
        }
        break;

      case "impact":
        if (!this.completedStages.has("diff")) {
          return {
            stage,
            rule: "REQUIRES_DIFF",
            message: "Cannot run impact analysis: diff has not been computed",
          };
        }
        break;

      case "governance":
        if (!this.completedStages.has("impact")) {
          return {
            stage,
            rule: "REQUIRES_IMPACT",
            message:
              "Cannot run governance: impact analysis has not been computed",
          };
        }
        break;

      case "persist":
        if (!this.completedStages.has("validate")) {
          return {
            stage,
            rule: "REQUIRES_VALIDATE",
            message: "Cannot persist: assembly has not been validated",
          };
        }
        break;

      case "validate":
        if (!this.completedStages.has("build")) {
          return {
            stage,
            rule: "REQUIRES_BUILD",
            message: "Cannot validate: assembly has not been built",
          };
        }
        break;

      case "build":
        if (!this.completedStages.has("assemble")) {
          return {
            stage,
            rule: "REQUIRES_ASSEMBLE",
            message: "Cannot build workspace: scripts have not been assembled",
          };
        }
        break;

      case "assemble":
        if (!this.completedStages.has("map")) {
          return {
            stage,
            rule: "REQUIRES_MAP",
            message:
              "Cannot assemble scripts: folder mapping has not been completed",
          };
        }
        break;

      case "map":
        // Map is always the first stage — no preconditions
        break;
    }

    return null;
  }

  /**
   * Mark a stage as completed (allows subsequent stages).
   */
  markCompleted(stage: CompilerStage): void {
    this.completedStages.add(stage);
  }

  /**
   * Check if a stage has been completed.
   */
  isCompleted(stage: CompilerStage): boolean {
    return this.completedStages.has(stage);
  }

  /**
   * Reset all guard state (for a new build).
   */
  reset(): void {
    this.completedStages.clear();
  }

  /**
   * Get all completed stages in order.
   */
  getCompletedStages(): CompilerStage[] {
    return STAGE_ORDER.filter((s) => this.completedStages.has(s));
  }

  /**
   * Get the next expected stage.
   */
  getNextExpectedStage(): CompilerStage | null {
    for (const stage of STAGE_ORDER) {
      if (!this.completedStages.has(stage)) return stage;
    }
    return null;
  }
}
