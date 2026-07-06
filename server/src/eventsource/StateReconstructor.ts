/**
 * StateReconstructor.ts
 *
 * Rebuilds system state from the EventStore.
 * Applies events sequentially to reconstruct:
 *  - Job queue state
 *  - Worker cluster state
 *  - Project contexts
 *  - Governance decisions
 *  - Telemetry baselines
 */

import { EventStore, getEventStore, type SystemEvent } from "./EventStore";
import { SnapshotManager, type SystemSnapshot } from "./SnapshotManager";

export interface SystemState {
  jobs: {
    queued: string[];
    running: Array<{ jobId: string; workerId: string }>;
    completed: string[];
    failed: string[];
  };
  workers: {
    registered: Array<{ workerId: string; status: string }>;
  };
  nodes: {
    registered: Array<{ nodeId: string; region: string; status: string }>;
  };
  projects: string[];
  governance: {
    decisionsCount: number;
    blockedCount: number;
  };
  telemetry: {
    totalBuilds: number;
    totalFailures: number;
  };
  lastOffset: number;
  reconstructedAt: Date;
}

export interface ProjectState {
  projectId: string;
  assemblies: string[];
  builds: number;
  lastBuildAt?: Date;
  governanceDecisions: number;
}

export class StateReconstructor {
  private eventStore: EventStore;
  private snapshotManager: SnapshotManager;

  constructor(eventStore?: EventStore, snapshotManager?: SnapshotManager) {
    this.eventStore = eventStore ?? getEventStore();
    this.snapshotManager = snapshotManager ?? new SnapshotManager();
  }

  /**
   * Rebuild full system state from EventStore.
   * Optimized: loads latest snapshot then replays only new events.
   */
  rebuildSystemState(): SystemState {
    // Try loading latest global snapshot
    const snapshot = this.snapshotManager.loadLatest("global");
    const startOffset = snapshot?.offset ?? 0;
    const baseState = snapshot
      ? (snapshot.state as SystemState)
      : this.emptyState();

    // Replay events since snapshot
    const events = this.eventStore.read(startOffset);
    const state = this.applyEvents(baseState, events);
    state.lastOffset = this.eventStore.getLatestOffset();
    state.reconstructedAt = new Date();

    console.log(
      `[RECONSTRUCT] System state rebuilt | Events replayed: ${events.length} | Offset: ${state.lastOffset}`,
    );

    return state;
  }

  /**
   * Rebuild state for a specific project.
   */
  rebuildProjectState(projectId: string): ProjectState {
    const events = this.eventStore.replay(projectId);

    const state: ProjectState = {
      projectId,
      assemblies: [],
      builds: 0,
      governanceDecisions: 0,
    };

    for (const evt of events) {
      switch (evt.type) {
        case "job.enqueued":
          if ((evt.payload as any)?.type === "BUILD") state.builds++;
          break;
        case "assembly.stored":
          if (evt.metadata.assemblyId)
            state.assemblies.push(evt.metadata.assemblyId);
          break;
        case "governance.decision":
          state.governanceDecisions++;
          break;
        case "job.completed":
          state.lastBuildAt = new Date(evt.timestamp);
          break;
      }
    }

    return state;
  }

  /**
   * Create a global snapshot at current offset.
   */
  takeGlobalSnapshot(): SystemSnapshot {
    const state = this.rebuildSystemState();
    return this.snapshotManager.createSnapshot(
      "global",
      state.lastOffset,
      state as unknown as Record<string, unknown>,
    );
  }

  private applyEvents(state: SystemState, events: SystemEvent[]): SystemState {
    for (const evt of events) {
      switch (evt.type) {
        case "job.enqueued":
          state.jobs.queued.push(evt.metadata.jobId ?? evt.eventId);
          break;
        case "job.started":
          state.jobs.queued = state.jobs.queued.filter(
            (id) => id !== evt.metadata.jobId,
          );
          state.jobs.running.push({
            jobId: evt.metadata.jobId ?? "",
            workerId: evt.metadata.workerId ?? "",
          });
          break;
        case "job.completed":
          state.jobs.running = state.jobs.running.filter(
            (j) => j.jobId !== evt.metadata.jobId,
          );
          state.jobs.completed.push(evt.metadata.jobId ?? "");
          state.telemetry.totalBuilds++;
          break;
        case "job.failed":
          state.jobs.running = state.jobs.running.filter(
            (j) => j.jobId !== evt.metadata.jobId,
          );
          state.jobs.failed.push(evt.metadata.jobId ?? "");
          state.telemetry.totalFailures++;
          break;
        case "worker.registered":
          state.workers.registered.push({
            workerId: evt.metadata.workerId ?? "",
            status: "active",
          });
          break;
        case "worker.stopped":
          state.workers.registered = state.workers.registered.filter(
            (w) => w.workerId !== evt.metadata.workerId,
          );
          break;
        case "node.registered":
          state.nodes.registered.push({
            nodeId: evt.metadata.nodeId ?? "",
            region: (evt.payload as any)?.region ?? "unknown",
            status: "online",
          });
          break;
        case "node.unregistered":
          state.nodes.registered = state.nodes.registered.filter(
            (n) => n.nodeId !== evt.metadata.nodeId,
          );
          break;
        case "project.created":
          if (evt.projectId) state.projects.push(evt.projectId);
          break;
        case "project.deleted":
          state.projects = state.projects.filter((p) => p !== evt.projectId);
          break;
        case "governance.decision":
          state.governance.decisionsCount++;
          if ((evt.payload as any)?.status === "BLOCK")
            state.governance.blockedCount++;
          break;
      }
    }
    return state;
  }

  private emptyState(): SystemState {
    return {
      jobs: { queued: [], running: [], completed: [], failed: [] },
      workers: { registered: [] },
      nodes: { registered: [] },
      projects: [],
      governance: { decisionsCount: 0, blockedCount: 0 },
      telemetry: { totalBuilds: 0, totalFailures: 0 },
      lastOffset: 0,
      reconstructedAt: new Date(),
    };
  }
}
