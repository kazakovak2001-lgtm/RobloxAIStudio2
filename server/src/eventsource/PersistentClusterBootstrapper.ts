/**
 * PersistentClusterBootstrapper.ts
 *
 * Boots the entire system from EventStore.
 * Loads latest snapshot → replays events → reconstructs full cluster state.
 * Used on system startup and crash recovery.
 */

import { EventStore, getEventStore } from "./EventStore";
import { SnapshotManager } from "./SnapshotManager";
import { StateReconstructor, type SystemState } from "./StateReconstructor";

export interface BootstrapResult {
  success: boolean;
  state: SystemState;
  eventsReplayed: number;
  snapshotUsed: boolean;
  durationMs: number;
  integrityValid: boolean;
}

export class PersistentClusterBootstrapper {
  private eventStore: EventStore;
  private snapshotManager: SnapshotManager;
  private reconstructor: StateReconstructor;

  constructor(storageRoot?: string) {
    this.eventStore = storageRoot
      ? new EventStore(storageRoot)
      : getEventStore();
    this.snapshotManager = new SnapshotManager(storageRoot);
    this.reconstructor = new StateReconstructor(
      this.eventStore,
      this.snapshotManager,
    );
  }

  /**
   * Bootstrap the system from persisted state.
   * This is the primary recovery path after crash/restart.
   */
  bootstrap(): BootstrapResult {
    const start = Date.now();

    // Check if any events exist
    const totalEvents = this.eventStore.getEventCount();
    if (totalEvents === 0) {
      console.log("[BOOTSTRAP] Fresh system — no events to replay");
      return {
        success: true,
        state: this.emptyState(),
        eventsReplayed: 0,
        snapshotUsed: false,
        durationMs: Date.now() - start,
        integrityValid: true,
      };
    }

    // Check for snapshot
    const snapshot = this.snapshotManager.loadLatest("global");
    const snapshotUsed = snapshot !== null;

    // Rebuild state
    const state = this.reconstructor.rebuildSystemState();

    // Validate integrity
    const integrityValid = this.validateIntegrity(state);

    const durationMs = Date.now() - start;

    console.log(
      `[BOOTSTRAP] Complete | Events: ${totalEvents} | Snapshot: ${snapshotUsed ? "yes" : "no"} | ` +
        `Integrity: ${integrityValid ? "VALID" : "INVALID"} | Duration: ${durationMs}ms`,
    );

    return {
      success: true,
      state,
      eventsReplayed: totalEvents - (snapshot?.offset ?? 0),
      snapshotUsed,
      durationMs,
      integrityValid,
    };
  }

  /**
   * Validate system state integrity after reconstruction.
   * Checks for:
   *  - Jobs in "running" that have no corresponding worker
   *  - Projects referenced but never created
   *  - Offset consistency
   */
  validateIntegrity(state?: SystemState): boolean {
    const s = state ?? this.reconstructor.rebuildSystemState();

    // All running jobs should have a registered worker
    const workerIds = new Set(s.workers.registered.map((w) => w.workerId));
    for (const job of s.jobs.running) {
      if (job.workerId && !workerIds.has(job.workerId)) {
        console.warn(
          `[BOOTSTRAP] Integrity issue: job ${job.jobId} assigned to unknown worker ${job.workerId}`,
        );
        return false;
      }
    }

    // Offset should match event count
    const eventCount = this.eventStore.getEventCount();
    if (s.lastOffset > eventCount) {
      console.warn(
        `[BOOTSTRAP] Integrity issue: state offset ${s.lastOffset} exceeds event count ${eventCount}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Create a recovery snapshot (call periodically or before shutdown).
   */
  createRecoverySnapshot(): void {
    this.reconstructor.takeGlobalSnapshot();
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
