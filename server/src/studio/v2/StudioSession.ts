/**
 * StudioSession — Session management for Studio Bridge connections.
 */

import { randomUUID } from "crypto";
import type { StudioOperationalEvidence } from "./StudioEvidenceStore";
import type { StudioClient } from "./StudioTypes";

export type StudioVerificationStatus =
  "idle" | "queued" | "delivered" | "acknowledged" | "verified" | "failed";

export interface BridgeSession {
  sessionId: string;
  clientId: string;
  projectId?: string;
  studioVersion: string;
  createdAt: number;
  lastActivity: number;
  lastQueuedAt?: number;
  lastDeliveredAt?: number;
  lastAcknowledgedAt?: number;
  lastSyncAt?: number;
  lastVerifiedAt?: number;
  syncCount?: number;
  lastCommandId?: string;
  lastExecutionId?: string;
  lastArtifactCount?: number;
  verifiedExecutionId?: string;
  verifiedArtifactCount?: number;
  verificationStatus?: StudioVerificationStatus;
  verificationError?: string;
  status: "active" | "expired" | "closed";
}

const SESSION_TIMEOUT_MS = 60_000; // 60 seconds without heartbeat → expired

export class StudioSessionManager {
  private sessions: Map<string, BridgeSession> = new Map();
  private clientToSession: Map<string, string> = new Map();

  /**
   * Create a session for a connected client.
   */
  create(client: StudioClient): BridgeSession {
    const previousSessionId = this.clientToSession.get(client.clientId);
    if (previousSessionId) {
      const previousSession = this.sessions.get(previousSessionId);
      if (previousSession) previousSession.status = "closed";
    }

    const session: BridgeSession = {
      sessionId: `session-${randomUUID().slice(0, 10)}`,
      clientId: client.clientId,
      projectId: client.projectId,
      studioVersion: client.studioVersion,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      syncCount: 0,
      verificationStatus: "idle",
      status: "active",
    };
    this.sessions.set(session.sessionId, session);
    this.clientToSession.set(client.clientId, session.sessionId);
    return session;
  }

  /**
   * Close a session.
   */
  close(clientId: string): boolean {
    const sessionId = this.clientToSession.get(clientId);
    if (!sessionId) return false;
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "closed";
    }
    this.clientToSession.delete(clientId);
    return true;
  }

  /**
   * Record activity (heartbeat).
   */
  recordActivity(clientId: string): boolean {
    const session = this.getByClient(clientId);
    if (!session || session.status !== "active") return false;
    session.lastActivity = Date.now();
    return true;
  }

  recordQueuedExport(
    clientId: string,
    executionId: string,
    artifactCount: number,
    commandId?: string,
  ): boolean {
    const session = this.getByClient(clientId);
    if (!session || session.status !== "active") return false;
    session.lastQueuedAt = Date.now();
    session.syncCount = (session.syncCount ?? 0) + 1;
    session.lastCommandId = commandId;
    session.lastExecutionId = executionId;
    session.lastArtifactCount = artifactCount;
    session.verificationStatus = "queued";
    session.verificationError = undefined;
    return true;
  }

  recordNoopExport(clientId: string, executionId: string): boolean {
    const session = this.getByClient(clientId);
    if (!session || session.status !== "active") return false;
    session.syncCount = (session.syncCount ?? 0) + 1;
    session.lastExecutionId = executionId;
    return true;
  }

  recordDeliveredExport(
    clientId: string,
    executionId: string,
    artifactCount: number,
    commandId?: string,
  ): boolean {
    const session = this.getByClient(clientId);
    if (!session || session.status !== "active") return false;
    session.lastActivity = Date.now();
    session.lastDeliveredAt = Date.now();
    session.lastCommandId = commandId ?? session.lastCommandId;
    if (executionId) session.lastExecutionId = executionId;
    session.lastArtifactCount = artifactCount;
    session.verificationStatus = "delivered";
    return true;
  }

  recordAcknowledgedExport(
    clientId: string,
    commandId: string,
    executionId: string,
  ): boolean {
    const session = this.getByClient(clientId);
    if (!session || session.status !== "active") return false;
    session.lastActivity = Date.now();
    session.lastAcknowledgedAt = Date.now();
    session.lastCommandId = commandId;
    session.lastExecutionId = executionId;
    session.verificationStatus = "acknowledged";
    return true;
  }

  recordVerifiedExport(
    clientId: string,
    commandId: string,
    executionId: string,
    artifactCount: number,
  ): boolean {
    const session = this.getByClient(clientId);
    if (!session || session.status !== "active") return false;
    const now = Date.now();
    session.lastActivity = now;
    session.lastSyncAt = now;
    session.lastVerifiedAt = now;
    session.lastCommandId = commandId;
    session.lastExecutionId = executionId;
    session.lastArtifactCount = artifactCount;
    session.verifiedExecutionId = executionId;
    session.verifiedArtifactCount = artifactCount;
    session.verificationStatus = "verified";
    session.verificationError = undefined;
    return true;
  }

  recordFailedExport(
    clientId: string,
    commandId: string,
    executionId: string,
    error: string,
  ): boolean {
    const session = this.getByClient(clientId);
    if (!session || session.status !== "active") return false;
    session.lastActivity = Date.now();
    session.lastCommandId = commandId;
    session.lastExecutionId = executionId;
    session.verificationStatus = "failed";
    session.verificationError = error;
    return true;
  }

  applyEvidence(
    clientId: string,
    evidence: StudioOperationalEvidence,
  ): boolean {
    const session = this.getByClient(clientId);
    if (!session || session.status !== "active") return false;
    session.syncCount = evidence.syncCount;
    session.lastCommandId = evidence.command.id;
    session.lastExecutionId = evidence.executionId;
    session.lastArtifactCount = evidence.artifactCount;
    session.lastQueuedAt = evidence.lastQueuedAt;
    session.lastDeliveredAt = evidence.lastDeliveredAt;
    session.lastAcknowledgedAt = evidence.lastAcknowledgedAt;
    session.lastSyncAt = evidence.lastSyncAt;
    session.lastVerifiedAt = evidence.lastVerifiedAt;
    session.verifiedExecutionId = evidence.verifiedExecutionId;
    session.verifiedArtifactCount = evidence.verifiedArtifactCount;
    session.verificationStatus = evidence.verificationStatus;
    session.verificationError = evidence.verificationError;
    return true;
  }

  /**
   * Get active session for a client.
   */
  getByClient(clientId: string): BridgeSession | null {
    const sessionId = this.clientToSession.get(clientId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Check for expired sessions and mark them.
   */
  checkTimeouts(): string[] {
    const now = Date.now();
    const expired: string[] = [];
    for (const [sessionId, session] of this.sessions) {
      if (
        session.status === "active" &&
        now - session.lastActivity > SESSION_TIMEOUT_MS
      ) {
        session.status = "expired";
        expired.push(sessionId);
      }
    }
    return expired;
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): BridgeSession[] {
    return [...this.sessions.values()].filter((s) => s.status === "active");
  }

  get count(): number {
    return this.sessions.size;
  }
}
