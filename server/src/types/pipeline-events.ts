export type PipelineEventType =
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.failed"
  | "evaluation.started"
  | "evaluation.completed"
  | "evaluation.failed"
  | "memory.created"
  | "memory.updated"
  | "memory.snapshot"
  | "memory.decision"
  | "planning.created"
  | "planning.updated"
  | "planning.step.selected"
  | "planning.replanned"
  | "planning.completed"
  | "planning.failed"
  | "generation.started"
  | "generation.blueprint.updated"
  | "generation.validation.completed"
  | "generation.report.created"
  | "generation.completed"
  | "generation.failed"
  | "assembly.started"
  | "assembly.workspace.created"
  | "assembly.mapping.completed"
  | "assembly.validation.completed"
  | "assembly.completed"
  | "assembly.failed"
  | "assembly.replay.completed"
  | "assembly.diff.completed"
  | "assembly.impact.analyzed"
  | "assembly.governance.decision"
  | "assembly.ci.blocked"
  | "assembly.ci.passed"
  | "compiler.build.started"
  | "compiler.build.completed"
  | "compiler.build.failed"
  | "compiler.stage.error"
  | "compiler.governance.decision"
  | "project.created"
  | "project.deleted"
  | "project.context.initialized"
  | "distributed.job.queued"
  | "distributed.job.started"
  | "distributed.job.completed"
  | "distributed.job.failed"
  | "distributed.worker.registered"
  | "distributed.worker.stopped"
  | "cloud.node.registered"
  | "cloud.node.unregistered"
  | "cloud.node.heartbeat"
  | "cloud.job.routed"
  | "cloud.node.failed"
  | "cluster.topology.updated"
  | "studio.connected"
  | "studio.disconnected"
  | "studio.sync.update"
  | "studio.asset.changed"
  | "studio.scene.updated"
  | "studio.import.completed"
  | "agent.task.created"
  | "agent.task.completed"
  | "agent.decision.made"
  | "agent.conflict.detected"
  | "agent.conflict.resolved";

export interface PipelineEvent {
  type: PipelineEventType;
  pipelineId: string;
  projectId?: string;
  stepId?: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export type PipelineEventHandler = (
  event: PipelineEvent,
) => void | Promise<void>;

export interface PipelineEventPublisher {
  emit(event: PipelineEvent): Promise<void>;
  emitStepStarted(
    pipelineId: string,
    stepId: string,
    stepName: string,
    projectId?: string,
  ): Promise<void>;
  emitStepCompleted(
    pipelineId: string,
    stepId: string,
    stepName: string,
    output?: unknown,
    projectId?: string,
  ): Promise<void>;
  emitStepFailed(
    pipelineId: string,
    stepId: string,
    stepName: string,
    error: string,
    projectId?: string,
  ): Promise<void>;
  emitPipelineStarted(pipelineId: string, projectId?: string): Promise<void>;
  emitPipelineCompleted(
    pipelineId: string,
    outputs?: Record<string, unknown>,
    projectId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  emitPipelineFailed(
    pipelineId: string,
    error: string,
    projectId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}
