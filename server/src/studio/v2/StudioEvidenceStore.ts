import type { StudioVerificationStatus } from "./StudioSession";
import type { StudioCommand } from "./StudioTypes";

export interface StudioOperationalEvidence {
  command: StudioCommand;
  projectId: string;
  executionId: string;
  artifactCount: number;
  snapshotSignature: string;
  version: number;
  syncCount: number;
  verificationStatus: StudioVerificationStatus;
  lastQueuedAt: number;
  lastDeliveredAt?: number;
  lastAcknowledgedAt?: number;
  lastSyncAt?: number;
  lastVerifiedAt?: number;
  verifiedExecutionId?: string;
  verifiedArtifactCount?: number;
  verificationError?: string;
}

export interface StudioEvidenceStore {
  ready(): Promise<void>;
  refresh(): Promise<void>;
  getCommand(commandId: string): StudioOperationalEvidence | null;
  getLatestByProject(projectId: string): StudioOperationalEvidence | null;
  /**
   * Publish one project-ordered lifecycle transition. The version claim makes
   * the transition cross-process safe; false means another writer won and the
   * caller must use the refreshed source state.
   */
  saveTransition(
    evidence: StudioOperationalEvidence,
    transition: string,
  ): Promise<boolean>;
}

export type StudioEvidenceStoreFactory = () => StudioEvidenceStore;

let configuredFactory: StudioEvidenceStoreFactory | null = null;

export function configureStudioEvidenceStoreFactory(
  factory: StudioEvidenceStoreFactory,
): void {
  configuredFactory = factory;
}

export function createConfiguredStudioEvidenceStore(): StudioEvidenceStore {
  return configuredFactory?.() ?? new InMemoryStudioEvidenceStore();
}

export class InMemoryStudioEvidenceStore implements StudioEvidenceStore {
  private readonly commands = new Map<string, StudioOperationalEvidence>();
  private readonly latestByProject = new Map<
    string,
    StudioOperationalEvidence
  >();
  private readonly claims = new Map<string, string>();

  async ready(): Promise<void> {}

  async refresh(): Promise<void> {}

  getCommand(commandId: string): StudioOperationalEvidence | null {
    return this.clone(this.commands.get(commandId));
  }

  getLatestByProject(projectId: string): StudioOperationalEvidence | null {
    return this.clone(this.latestByProject.get(projectId));
  }

  async saveTransition(
    evidence: StudioOperationalEvidence,
    transition: string,
  ): Promise<boolean> {
    const snapshot = structuredClone(evidence);
    const latest = this.latestByProject.get(snapshot.projectId);
    const expectedVersion = (latest?.version ?? 0) + 1;
    const claim = `${snapshot.projectId}:${expectedVersion}`;
    if (snapshot.version !== expectedVersion || this.claims.has(claim)) {
      return false;
    }

    this.claims.set(claim, transition);
    this.commands.set(snapshot.command.id, snapshot);
    this.latestByProject.set(snapshot.projectId, snapshot);
    return true;
  }

  private clone(
    evidence: StudioOperationalEvidence | undefined,
  ): StudioOperationalEvidence | null {
    return evidence ? structuredClone(evidence) : null;
  }
}
