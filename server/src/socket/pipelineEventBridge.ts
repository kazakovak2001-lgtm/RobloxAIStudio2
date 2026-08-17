/**
 * Bridges pipeline lifecycle events onto Socket.IO for the Workspace UI.
 *
 * SEC-REALTIME-GLOBAL-001. This lived inline in the server entrypoint, which
 * meant its tenancy behaviour could only be asserted by reading the source. It
 * is a named unit here so a test can drive the real bridge with real sockets
 * and observe what a foreign client receives.
 *
 * The event names are unchanged; this is a thin adapter only.
 */

import type { Server as SocketServer } from "socket.io";
import type { SaaSProjectRepository } from "../platform/projects";
import type { GenerationHistoryRepository } from "../projects/repository/generationHistory.repository";
import type { PipelineEventEmitter } from "./streaming";

export function registerPipelineEventBridge(
  io: SocketServer,
  events: PipelineEventEmitter,
  projectRepository: SaaSProjectRepository,
  generationHistory: GenerationHistoryRepository,
): void {
  events.onEvent(async (evt) => {
    // Minimal bridge logging for E2E verification.
    console.log(
      `[pipeline-bridge] emitted ${evt.type} pipelineId=${evt.pipelineId} stepId=${evt.stepId ?? "-"}`,
    );

    /**
     * SEC-REALTIME-GLOBAL-001 and SEC-REALTIME-PIPELINE-FALLBACK-001.
     *
     * Every pipeline, evaluation, memory and planning event is addressed to the
     * room of the project it belongs to. An event without a project is dropped
     * rather than broadcast: a payload that cannot be addressed to the sockets
     * entitled to it must not instead be delivered to all of them. Client-side
     * filtering is not a boundary, because by then the unauthorized socket has
     * already received the payload.
     */
    const emitForProject = (
      eventName: string,
      payload: Record<string, unknown>,
    ) => {
      if (!evt.projectId) {
        console.warn(
          `[pipeline-bridge] dropped ${eventName} with no project scope pipelineId=${evt.pipelineId}`,
        );
        return;
      }
      io.to(`project:${evt.projectId}`).emit(eventName, payload);
    };

    switch (evt.type) {
      case "pipeline.started": {
        const payload = {
          pipelineId: evt.pipelineId,
          projectId: evt.projectId,
          startedAt: evt.timestamp.toISOString(),
        };
        console.log(
          "[pipeline-bridge] forwarding",
          "pipeline.started",
          payload,
        );
        emitForProject("pipeline.started", payload);
        break;
      }
      case "step.started": {
        const payload = {
          pipelineId: evt.pipelineId,
          projectId: evt.projectId,
          stepId: evt.stepId,
          agentId: evt.data?.name,
          status: "started",
          progress: 0,
          timestamp: evt.timestamp.toISOString(),
        };
        console.log("[pipeline-bridge] forwarding", "step.started", payload);
        emitForProject("step.started", payload);
        break;
      }
      case "step.completed": {
        const payload = {
          pipelineId: evt.pipelineId,
          projectId: evt.projectId,
          stepId: evt.stepId,
          agentId: evt.data?.name,
          status: "completed",
          progress: 100,
          timestamp: evt.timestamp.toISOString(),
          output: evt.data?.output,
        };
        console.log("[pipeline-bridge] forwarding", "step.completed", payload);
        emitForProject("step.completed", payload);
        break;
      }
      case "step.failed": {
        const payload = {
          pipelineId: evt.pipelineId,
          projectId: evt.projectId,
          stepId: evt.stepId,
          agentId: evt.data?.name,
          status: "failed",
          progress: 0,
          timestamp: evt.timestamp.toISOString(),
          error: evt.data?.error,
        };
        console.log("[pipeline-bridge] forwarding", "step.failed", payload);
        emitForProject("step.failed", payload);
        break;
      }
      case "pipeline.completed": {
        const payload = {
          pipelineId: evt.pipelineId,
          projectId: evt.projectId,
          outputs: evt.data?.outputs,
          timestamp: evt.timestamp.toISOString(),
        };
        if (evt.projectId) {
          await projectRepository.updateDurable(evt.projectId, {
            status: "ready",
            qualityScore: 100,
          });
          const record = generationHistory.getByPipeline(evt.pipelineId);
          if (record) {
            const finishedAt = evt.timestamp.getTime();
            const completed = Number(
              evt.data?.completedSteps ?? record.stagesCompleted,
            );
            const failed = Number(evt.data?.failedSteps ?? record.failures);
            await generationHistory.record({
              ...record,
              status: "completed",
              finishedAt,
              duration: finishedAt - record.startedAt,
              stagesCompleted: completed,
              stagesTotal: Math.max(record.stagesTotal, completed + failed),
              failures: failed,
            });
          }
        }
        console.log(
          "[pipeline-bridge] forwarding",
          "pipeline.completed",
          payload,
        );
        emitForProject("pipeline.completed", payload);
        break;
      }
      case "pipeline.failed": {
        const payload = {
          pipelineId: evt.pipelineId,
          projectId: evt.projectId,
          timestamp: evt.timestamp.toISOString(),
          error: evt.data?.error,
          stepId: evt.data?.stepId ?? evt.data?.failedStepId,
          agentId: evt.data?.agentId ?? evt.data?.failedAgentId,
          stage: evt.data?.stage,
          failedReason: evt.data?.failedReason,
          failedSteps: evt.data?.failedSteps,
          completedSteps: evt.data?.completedSteps,
        };
        if (evt.projectId) {
          await projectRepository.updateDurable(evt.projectId, {
            status: "draft",
          });
          const record = generationHistory.getByPipeline(evt.pipelineId);
          if (record) {
            const finishedAt = evt.timestamp.getTime();
            const completed = Number(
              evt.data?.completedSteps ?? record.stagesCompleted,
            );
            const failed = Number(
              evt.data?.failedSteps ?? (record.failures || 1),
            );
            await generationHistory.record({
              ...record,
              status: "failed",
              finishedAt,
              duration: finishedAt - record.startedAt,
              stagesCompleted: completed,
              stagesTotal: Math.max(record.stagesTotal, completed + failed),
              failures: failed,
            });
          }
        }
        console.log("[pipeline-bridge] forwarding", "pipeline.failed", payload);
        emitForProject("pipeline.failed", payload);
        break;
      }
      case "evaluation.started": {
        emitForProject("evaluation.started", {
          pipelineId: evt.pipelineId,
          stepId: evt.stepId,
          agentType: evt.data?.agentType,
          timestamp: evt.timestamp,
        });
        break;
      }
      case "evaluation.completed": {
        emitForProject("evaluation.completed", {
          pipelineId: evt.pipelineId,
          stepId: evt.stepId,
          qualityScore: evt.data?.qualityScore,
          status: evt.data?.status,
          issueCount: evt.data?.issueCount,
          durationMs: evt.data?.durationMs,
          recommendations: evt.data?.recommendations,
        });
        break;
      }
      case "evaluation.failed": {
        emitForProject("evaluation.failed", {
          pipelineId: evt.pipelineId,
          stepId: evt.stepId,
          qualityScore: evt.data?.qualityScore,
          issues: evt.data?.issues,
        });
        break;
      }
      case "memory.created": {
        emitForProject("memory.created", {
          pipelineId: evt.pipelineId,
          executionId: evt.data?.executionId,
          blueprintId: evt.data?.blueprintId,
        });
        break;
      }
      case "memory.updated": {
        emitForProject("memory.updated", {
          pipelineId: evt.pipelineId,
          stepId: evt.stepId,
          agent: evt.data?.agent,
          section: evt.data?.section,
        });
        break;
      }
      case "memory.snapshot": {
        emitForProject("memory.snapshot", {
          pipelineId: evt.pipelineId,
          stepId: evt.stepId,
          snapshotId: evt.data?.snapshotId,
          snapshotNumber: evt.data?.snapshotNumber,
        });
        break;
      }
      case "memory.decision": {
        emitForProject("memory.decision", {
          pipelineId: evt.pipelineId,
          stepId: evt.stepId,
          category: evt.data?.category,
          summary: evt.data?.summary,
          agent: evt.data?.agent,
        });
        break;
      }
      case "planning.created": {
        emitForProject("planning.created", {
          pipelineId: evt.pipelineId,
          planId: evt.data?.planId,
          steps: evt.data?.steps,
        });
        break;
      }
      case "planning.updated": {
        emitForProject("planning.updated", {
          pipelineId: evt.pipelineId,
          completed: evt.data?.completed,
          remaining: evt.data?.remaining,
        });
        break;
      }
      case "planning.step.selected": {
        emitForProject("planning.step.selected", {
          pipelineId: evt.pipelineId,
          stepId: evt.stepId,
          agent: evt.data?.agent,
          priority: evt.data?.priority,
        });
        break;
      }
      case "planning.replanned": {
        emitForProject("planning.replanned", {
          pipelineId: evt.pipelineId,
          stepId: evt.stepId,
          reason: evt.data?.reason,
          preserved: evt.data?.preserved,
          remaining: evt.data?.remaining,
        });
        break;
      }
      case "planning.completed": {
        emitForProject("planning.completed", {
          pipelineId: evt.pipelineId,
          planId: evt.data?.planId,
          metrics: evt.data?.metrics,
        });
        break;
      }
      case "planning.failed": {
        emitForProject("planning.failed", {
          pipelineId: evt.pipelineId,
          error: evt.data?.error,
        });
        break;
      }
      case "generation.started":
      case "generation.blueprint.updated":
      case "generation.validation.completed":
      case "generation.report.created":
      case "generation.completed":
      case "generation.failed":
      case "assembly.started":
      case "assembly.workspace.created":
      case "assembly.mapping.completed":
      case "assembly.validation.completed":
      case "assembly.completed":
      case "assembly.failed":
      case "assembly.replay.completed":
      case "assembly.diff.completed":
      case "assembly.impact.analyzed":
      case "assembly.governance.decision":
      case "assembly.ci.blocked":
      case "assembly.ci.passed":
      case "compiler.build.started":
      case "compiler.build.completed":
      case "compiler.build.failed":
      case "compiler.stage.error":
      case "compiler.governance.decision":
      case "project.created":
      case "project.deleted":
      case "project.context.initialized":
      case "distributed.job.queued":
      case "distributed.job.started":
      case "distributed.job.completed":
      case "distributed.job.failed":
      case "distributed.worker.registered":
      case "distributed.worker.stopped":
      case "cloud.node.registered":
      case "cloud.node.unregistered":
      case "cloud.node.heartbeat":
      case "cloud.job.routed":
      case "cloud.node.failed":
      case "cluster.topology.updated":
      case "studio.connected":
      case "studio.disconnected":
      case "studio.sync.update":
      case "studio.asset.changed":
      case "studio.scene.updated":
      case "studio.import.completed":
      case "agent.task.created":
      case "agent.task.completed":
      case "agent.decision.made":
      case "agent.conflict.detected":
      case "agent.conflict.resolved": {
        emitForProject(evt.type, {
          pipelineId: evt.pipelineId,
          projectId: evt.projectId,
          timestamp: evt.timestamp.toISOString(),
          ...evt.data,
        });
        break;
      }
      default:
        break;
    }
  });
}
