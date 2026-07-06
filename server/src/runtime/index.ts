/**
 * Runtime Execution Layer — public API
 *
 * v1.8: Self-healing, checkpoint-based, observable generation runtime.
 */

export {
  RuntimeExecutionController,
  type ExecutionPhase,
  type RuntimeExecutionConfig,
  type RuntimeExecutionResult,
} from "./controller/RuntimeExecutionController";
export {
  ExecutionCheckpointSystem,
  type Checkpoint,
} from "./checkpoint/ExecutionCheckpointSystem";
export {
  RuntimeErrorBoundary,
  type ExecutionFailureReport,
  type FailureType,
} from "./errors/RuntimeErrorBoundary";
export {
  PipelineTelemetry,
  type ExecutionTelemetry,
  type TelemetryEvent,
} from "./telemetry/PipelineTelemetry";
export {
  E2EGenerationSimulator,
  type E2ESimulationReport,
  type SimulationConfig,
  type SimulationMode,
} from "./simulation/E2EGenerationSimulator";
export {
  FailureModeRegistry,
  type FailureMode,
  type FailureSeverity,
  type RecoveryStrategy,
} from "./failures/FailureModeRegistry";
