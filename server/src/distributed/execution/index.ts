/**
 * Distributed Execution — public API
 *
 * Queue-based horizontal scaling for PlanExecutor AI pipeline execution.
 */

export {
  ExecutionContext,
  type ExecutionContextConfig,
  type AgentNodeState,
  type ExecutionMetrics,
} from "./ExecutionContext";
export {
  ExecutionJobQueue,
  type ExecutionJob,
  type ExecutionJobStatus,
  type DeadLetterEntry,
  type QueueMetrics,
} from "./ExecutionJobQueue";
export {
  ExecutionWorker,
  type WorkerState,
  type WorkerConfig,
  type WorkerMetrics,
} from "./ExecutionWorker";
export {
  ExecutionCoordinator,
  type CoordinatorConfig,
  type ScalingSignal,
  type ClusterHealth,
} from "./ExecutionCoordinator";
