import type { AutonomousPhaseContext } from "../AutonomousPhaseRegistry";
import type { OrchestratorSession } from "../OrchestratorTypes";

export interface AutonomousSessionRecord {
  session: OrchestratorSession;
  context: AutonomousPhaseContext;
  checkpointSequence: number;
}

export interface AutonomousSessionStore {
  ready(): Promise<void>;
  refresh?(): Promise<void>;
  save(record: AutonomousSessionRecord): Promise<void>;
  claimExecution(record: AutonomousSessionRecord): Promise<boolean>;
  get(sessionId: string): AutonomousSessionRecord | null;
  getAll(): AutonomousSessionRecord[];
  markInterrupted(): Promise<number>;
}

export type AutonomousSessionStoreFactory = () => AutonomousSessionStore;

let configuredFactory: AutonomousSessionStoreFactory | null = null;

export function configureAutonomousSessionStoreFactory(
  factory: AutonomousSessionStoreFactory,
): void {
  configuredFactory = factory;
}

export function createConfiguredAutonomousSessionStore(): AutonomousSessionStore | null {
  return configuredFactory?.() ?? null;
}

export class InMemoryAutonomousSessionStore implements AutonomousSessionStore {
  private readonly records = new Map<string, AutonomousSessionRecord>();
  private readonly executionClaims = new Set<string>();

  async ready(): Promise<void> {}

  async refresh(): Promise<void> {}

  async save(record: AutonomousSessionRecord): Promise<void> {
    const snapshot = normalizeAutonomousSessionRecord(record);
    this.records.set(snapshot.session.id, snapshot);
  }

  async claimExecution(record: AutonomousSessionRecord): Promise<boolean> {
    const normalized = normalizeAutonomousSessionRecord(record);
    const claim = `${normalized.session.id}:${normalized.session.executionGeneration}`;
    if (this.executionClaims.has(claim)) return false;
    this.executionClaims.add(claim);
    await this.save(normalized);
    return true;
  }

  get(sessionId: string): AutonomousSessionRecord | null {
    const record = this.records.get(sessionId);
    return record ? normalizeAutonomousSessionRecord(record) : null;
  }

  getAll(): AutonomousSessionRecord[] {
    return [...this.records.values()].map(normalizeAutonomousSessionRecord);
  }

  async markInterrupted(): Promise<number> {
    let interrupted = 0;
    for (const current of this.getAll()) {
      if (current.session.status !== "running") continue;
      const timestamp = this.interruptionTimestamp(current.session);
      current.session.status = "paused";
      current.session.currentPhase = "paused";
      current.session.restartInterruptedAt = timestamp;
      current.session.recoveryReason = "server_restart";
      for (const node of current.session.phases) {
        if (node.status !== "running") continue;
        node.status = "pending";
        node.startedAt = undefined;
        node.completedAt = undefined;
        node.durationMs = undefined;
      }
      await this.save(current);
      interrupted += 1;
    }
    return interrupted;
  }

  private interruptionTimestamp(session: OrchestratorSession): number {
    return (
      session.phases.find((node) => node.status === "running")?.startedAt ??
      session.startedAt
    );
  }
}

export function normalizeAutonomousSessionRecord(
  record: AutonomousSessionRecord,
): AutonomousSessionRecord {
  const normalized = structuredClone(record);
  if (
    !Number.isSafeInteger(normalized.session.executionGeneration) ||
    normalized.session.executionGeneration < 0
  ) {
    normalized.session.executionGeneration = 0;
  }
  return normalized;
}
