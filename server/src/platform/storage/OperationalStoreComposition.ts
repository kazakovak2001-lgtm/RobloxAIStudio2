import type { OrchestratorSession } from "../../orchestrator/OrchestratorTypes";
import {
  configureAutonomousSessionStoreFactory,
  normalizeAutonomousSessionRecord,
  type AutonomousSessionRecord,
  type AutonomousSessionStore,
} from "../../orchestrator/store/AutonomousSessionStore";
import type { PipelineState } from "../../pipeline/v2/PipelineStage";
import { configureArtifactStorageFactory } from "../../pipeline/v2/ArtifactStore";
import {
  configurePipelineStoreFactory,
  type PipelineStore,
} from "../../pipeline/v2/store/PipelineStore";
import {
  configureStudioEvidenceStoreFactory,
  type StudioEvidenceStore,
  type StudioOperationalEvidence,
} from "../../studio/v2/StudioEvidenceStore";
import {
  DurableStorageConflictError,
  type DurableMutation,
  type StorageProvider,
} from "./StorageProvider";

const PIPELINE_STATES = "pipeline_runtime_states";
const PIPELINE_RECOVERY_CLAIMS = "pipeline_runtime_recovery_claims";
const AUTONOMOUS_SESSIONS = "autonomous_runtime_sessions";
const AUTONOMOUS_RECOVERY_CLAIMS = "autonomous_runtime_recovery_claims";
const AUTONOMOUS_EXECUTION_CLAIMS = "autonomous_runtime_execution_claims";
const STUDIO_EVIDENCE = "studio_operational_evidence";
const STUDIO_PROJECT_EVIDENCE = "studio_project_operational_evidence";
const STUDIO_TRANSITION_CLAIMS = "studio_operational_transition_claims";

export function configureOperationalStores(storage: StorageProvider): void {
  configureArtifactStorageFactory(() => storage);
  configurePipelineStoreFactory(() => new StoragePipelineStore(storage));
  configureAutonomousSessionStoreFactory(
    () => new StorageAutonomousSessionStore(storage),
  );
  configureStudioEvidenceStoreFactory(
    () => new StorageStudioEvidenceStore(storage),
  );
}

export class StorageStudioEvidenceStore implements StudioEvidenceStore {
  constructor(private readonly storage: StorageProvider) {}

  async ready(): Promise<void> {
    await this.storage.ready?.();
  }

  async refresh(): Promise<void> {
    await this.storage.refresh?.([STUDIO_EVIDENCE, STUDIO_PROJECT_EVIDENCE]);
  }

  getCommand(commandId: string): StudioOperationalEvidence | null {
    const evidence = this.storage.get<StudioOperationalEvidence>(
      STUDIO_EVIDENCE,
      commandId,
    );
    return evidence ? structuredClone(evidence) : null;
  }

  getLatestByProject(projectId: string): StudioOperationalEvidence | null {
    const evidence = this.storage.get<StudioOperationalEvidence>(
      STUDIO_PROJECT_EVIDENCE,
      projectId,
    );
    return evidence ? structuredClone(evidence) : null;
  }

  async saveTransition(
    evidence: StudioOperationalEvidence,
    transition: string,
  ): Promise<boolean> {
    const snapshot = structuredClone(evidence);
    const expectedVersion =
      (this.getLatestByProject(snapshot.projectId)?.version ?? 0) + 1;
    if (snapshot.version !== expectedVersion) {
      await this.refresh();
      return false;
    }

    try {
      await this.storage.applyDurableBatch([
        {
          operation: "set",
          collection: STUDIO_TRANSITION_CLAIMS,
          id: `${snapshot.projectId}:${snapshot.version}`,
          data: {
            projectId: snapshot.projectId,
            commandId: snapshot.command.id,
            version: snapshot.version,
            transition,
          },
          requireAbsent: true,
        },
        {
          operation: "set",
          collection: STUDIO_EVIDENCE,
          id: snapshot.command.id,
          data: snapshot,
        },
        {
          operation: "set",
          collection: STUDIO_PROJECT_EVIDENCE,
          id: snapshot.projectId,
          data: snapshot,
        },
      ]);
      return true;
    } catch (error) {
      if (!(error instanceof DurableStorageConflictError)) throw error;
      await this.refresh();
      return false;
    }
  }
}

export class StorageAutonomousSessionStore implements AutonomousSessionStore {
  private readonly recoveredSnapshots = new Map<
    string,
    AutonomousSessionRecord
  >();

  constructor(private readonly storage: StorageProvider) {}

  async ready(): Promise<void> {
    await this.storage.ready?.();
  }

  async refresh(): Promise<void> {
    await this.storage.refresh?.([AUTONOMOUS_SESSIONS]);
    this.recoveredSnapshots.clear();
  }

  async save(record: AutonomousSessionRecord): Promise<void> {
    const snapshot = structuredClone(record);
    await this.storage.setDurable(
      AUTONOMOUS_SESSIONS,
      snapshot.session.id,
      snapshot,
    );
    this.recoveredSnapshots.delete(snapshot.session.id);
  }

  async claimExecution(record: AutonomousSessionRecord): Promise<boolean> {
    const snapshot = normalizeAutonomousSessionRecord(record);
    const claimId = `${snapshot.session.id}:${snapshot.session.executionGeneration}`;
    try {
      await this.storage.applyDurableBatch([
        {
          operation: "set",
          collection: AUTONOMOUS_EXECUTION_CLAIMS,
          id: claimId,
          data: {
            sessionId: snapshot.session.id,
            executionGeneration: snapshot.session.executionGeneration,
          },
          requireAbsent: true,
        },
        {
          operation: "set",
          collection: AUTONOMOUS_SESSIONS,
          id: snapshot.session.id,
          data: snapshot,
        },
      ]);
      this.recoveredSnapshots.delete(snapshot.session.id);
      return true;
    } catch (error) {
      if (!(error instanceof DurableStorageConflictError)) throw error;
      await this.storage.refresh?.([AUTONOMOUS_SESSIONS]);
      this.recoveredSnapshots.delete(snapshot.session.id);
      return false;
    }
  }

  get(sessionId: string): AutonomousSessionRecord | null {
    const recovered = this.recoveredSnapshots.get(sessionId);
    if (recovered) return normalizeAutonomousSessionRecord(recovered);
    const record = this.storage.get<AutonomousSessionRecord>(
      AUTONOMOUS_SESSIONS,
      sessionId,
    );
    return record ? normalizeAutonomousSessionRecord(record) : null;
  }

  getAll(): AutonomousSessionRecord[] {
    const records = new Map(
      this.storage
        .list<AutonomousSessionRecord>(AUTONOMOUS_SESSIONS)
        .map((record) => [
          record.session.id,
          normalizeAutonomousSessionRecord(record),
        ]),
    );
    for (const [sessionId, recovered] of this.recoveredSnapshots) {
      records.set(sessionId, normalizeAutonomousSessionRecord(recovered));
    }
    return [...records.values()];
  }

  async markInterrupted(): Promise<number> {
    const running = this.getAll().filter(
      (record) => record.session.status === "running",
    );
    let interrupted = 0;

    for (const current of running) {
      const recovered = this.createInterruptedRecord(current);
      try {
        await this.storage.applyDurableBatch([
          {
            operation: "set",
            collection: AUTONOMOUS_RECOVERY_CLAIMS,
            id: `${recovered.session.id}:${recovered.session.recoveryCount}`,
            data: {
              sessionId: recovered.session.id,
              recoveryCount: recovered.session.recoveryCount,
              interruptedAt: recovered.session.restartInterruptedAt,
            },
            requireAbsent: true,
          },
          {
            operation: "set",
            collection: AUTONOMOUS_SESSIONS,
            id: recovered.session.id,
            data: recovered,
          },
        ]);
        this.recoveredSnapshots.delete(recovered.session.id);
        interrupted += 1;
      } catch (error) {
        if (!(error instanceof DurableStorageConflictError)) throw error;
        await this.storage.refresh?.([AUTONOMOUS_SESSIONS]);
        this.recoveredSnapshots.delete(recovered.session.id);
      }
    }
    return interrupted;
  }

  private createInterruptedRecord(
    current: AutonomousSessionRecord,
  ): AutonomousSessionRecord {
    const recovered = structuredClone(current);
    const interruptedAt = this.interruptionTimestamp(recovered.session);
    recovered.session.status = "paused";
    recovered.session.currentPhase = "paused";
    recovered.session.restartInterruptedAt = interruptedAt;
    recovered.session.recoveryReason = "server_restart";
    for (const node of recovered.session.phases) {
      if (node.status !== "running") continue;
      node.status = "pending";
      node.startedAt = undefined;
      node.completedAt = undefined;
      node.durationMs = undefined;
    }
    return recovered;
  }

  private interruptionTimestamp(session: OrchestratorSession): number {
    return (
      session.phases.find((node) => node.status === "running")?.startedAt ??
      session.startedAt
    );
  }
}

export class StoragePipelineStore implements PipelineStore {
  private readonly recoveredSnapshots = new Map<string, PipelineState>();

  constructor(private readonly storage: StorageProvider) {}

  async save(state: PipelineState): Promise<void> {
    const snapshot = structuredClone(state);
    await this.storage.setDurable(
      PIPELINE_STATES,
      snapshot.pipelineId,
      snapshot,
    );
    this.recoveredSnapshots.delete(snapshot.pipelineId);
  }

  get(pipelineId: string): PipelineState | null {
    const recovered = this.recoveredSnapshots.get(pipelineId);
    if (recovered) return structuredClone(recovered);
    const state = this.storage.get<PipelineState>(PIPELINE_STATES, pipelineId);
    return state ? structuredClone(state) : null;
  }

  getAll(): PipelineState[] {
    const states = new Map(
      this.storage
        .list<PipelineState>(PIPELINE_STATES)
        .map((state) => [state.pipelineId, structuredClone(state)]),
    );
    for (const [pipelineId, recovered] of this.recoveredSnapshots) {
      states.set(pipelineId, structuredClone(recovered));
    }
    return [...states.values()];
  }

  async delete(pipelineId: string): Promise<boolean> {
    const deleted = await this.storage.deleteDurable(
      PIPELINE_STATES,
      pipelineId,
    );
    if (deleted) this.recoveredSnapshots.delete(pipelineId);
    return deleted;
  }

  has(pipelineId: string): boolean {
    return this.get(pipelineId) !== null;
  }

  count(): number {
    return this.getAll().length;
  }

  getByStatus(status: string): PipelineState[] {
    return this.getAll().filter((candidate) => candidate.status === status);
  }

  async markInterrupted(): Promise<number> {
    const running = this.getAll().filter(
      (candidate) => candidate.status === "running",
    );
    let interruptedCount = 0;

    for (const state of running) {
      const interrupted = this.createInterruptedSnapshot(state);
      const mutations: DurableMutation[] = [
        {
          operation: "set",
          collection: PIPELINE_RECOVERY_CLAIMS,
          id: interrupted.pipelineId,
          data: {
            pipelineId: interrupted.pipelineId,
            interruptedAt: interrupted.finishedAt,
          },
          requireAbsent: true,
        },
        {
          operation: "set",
          collection: PIPELINE_STATES,
          id: interrupted.pipelineId,
          data: interrupted,
        },
      ];

      try {
        await this.storage.applyDurableBatch(mutations);
        this.recoveredSnapshots.delete(interrupted.pipelineId);
        interruptedCount += 1;
      } catch (error) {
        if (!(error instanceof DurableStorageConflictError)) throw error;
        this.recoveredSnapshots.set(interrupted.pipelineId, interrupted);
      }
    }
    return interruptedCount;
  }

  private createInterruptedSnapshot(state: PipelineState): PipelineState {
    const interrupted = structuredClone(state);
    const runningStage = interrupted.stages.find(
      (stage) => stage.status === "running",
    );
    const interruptedAt = runningStage?.startedAt ?? interrupted.startedAt;

    interrupted.status = "failed";
    interrupted.finishedAt = interruptedAt;
    interrupted.currentStage = null;
    for (const stage of interrupted.stages) {
      if (stage.status !== "running") continue;
      stage.status = "failed";
      stage.error = "Interrupted: server restart";
      stage.completedAt = interruptedAt;
      if (!interrupted.failedStages.includes(stage.name)) {
        interrupted.failedStages.push(stage.name);
      }
    }
    return interrupted;
  }
}
