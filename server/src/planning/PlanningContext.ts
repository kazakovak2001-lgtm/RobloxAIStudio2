import type { ProjectContext } from "../memory/MemoryTypes";
import type {
  ArchitecturalDecision,
  AgentExecutionRecord,
} from "../memory/MemoryTypes";
import type { ExecutionPlan } from "./PlanningTypes";

/**
 * PlanningContext
 *
 * Read-only view consumed by PlanningEngine when making scheduling decisions.
 * Aggregates information from Memory, Evaluation, and the current plan.
 */
export interface PlanningContext {
  /** Current typed project state from memory. */
  projectContext: Readonly<ProjectContext>;
  /** All architectural decisions recorded so far. */
  decisions: ReadonlyArray<ArchitecturalDecision>;
  /** Agent execution history with quality scores. */
  executionHistory: ReadonlyArray<AgentExecutionRecord>;
  /** Current execution plan (live reference). */
  plan: ExecutionPlan;
}
