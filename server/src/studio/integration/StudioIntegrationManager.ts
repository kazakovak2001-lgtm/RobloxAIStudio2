/**
 * StudioIntegrationManager.ts
 *
 * Top-level coordinator for Roblox Studio integration.
 * Connects: ConnectionRegistry → ImportValidator → PackageSynchronizer → Bridge
 */

import { StudioBridgeServer } from "../StudioBridgeServer";
import { StudioConnectionRegistry } from "./StudioConnectionRegistry";
import { PackageSynchronizer } from "./PackageSynchronizer";
import { StudioImportValidator } from "./StudioImportValidator";
import { StudioSyncMetrics } from "./StudioSyncMetrics";
import type { GenerationPackage } from "../../generation/coordinator/types";
import type {
  SyncResult,
  ImportValidationReport,
  StudioSyncMetricsData,
  StudioProjectSession,
} from "./types";

export type StudioEventType =
  | "StudioConnected"
  | "StudioDisconnected"
  | "SyncStarted"
  | "SyncProgress"
  | "SyncCompleted"
  | "SyncFailed"
  | "ImportValidated";
export interface StudioEvent {
  type: StudioEventType;
  studioId: string;
  timestamp: number;
  data: Record<string, unknown>;
}
export type StudioEventListener = (event: StudioEvent) => void;

export class StudioIntegrationManager {
  private bridge: StudioBridgeServer;
  private registry: StudioConnectionRegistry;
  private synchronizer: PackageSynchronizer;
  private validator: StudioImportValidator;
  private metrics: StudioSyncMetrics;
  private listeners: StudioEventListener[] = [];

  constructor(bridge?: StudioBridgeServer) {
    this.bridge = bridge ?? new StudioBridgeServer();
    this.registry = new StudioConnectionRegistry();
    this.synchronizer = new PackageSynchronizer(this.bridge, this.registry);
    this.validator = new StudioImportValidator();
    this.metrics = new StudioSyncMetrics();
  }

  // ─── Connection ───────────────────────────────────────────────────────

  connect(studioId: string, projectId: string): StudioProjectSession {
    const session = this.registry.connect(studioId, projectId);
    this.bridge.connectSession(studioId, projectId);
    this.emit({
      type: "StudioConnected",
      studioId,
      timestamp: Date.now(),
      data: { sessionId: session.sessionId, projectId },
    });
    return session;
  }

  disconnect(studioId: string): void {
    this.registry.disconnect(studioId);
    this.bridge.disconnectSession(studioId);
    this.emit({
      type: "StudioDisconnected",
      studioId,
      timestamp: Date.now(),
      data: {},
    });
  }

  heartbeat(studioId: string): boolean {
    return this.registry.heartbeat(studioId);
  }

  // ─── Synchronization ──────────────────────────────────────────────────

  synchronize(studioId: string, pkg: GenerationPackage): SyncResult {
    this.emit({
      type: "SyncStarted",
      studioId,
      timestamp: Date.now(),
      data: { packageId: pkg.packageId },
    });

    // Validate first
    const validation = this.validator.validate(pkg);
    this.emit({
      type: "ImportValidated",
      studioId,
      timestamp: Date.now(),
      data: { valid: validation.valid, errors: validation.errors.length },
    });

    if (!validation.valid) {
      const failResult: SyncResult = {
        success: false,
        sessionId: "",
        payloadId: "",
        itemsSynced: 0,
        totalSize: 0,
        durationMs: 0,
        error: validation.errors.join("; "),
      };
      this.metrics.record(failResult);
      this.emit({
        type: "SyncFailed",
        studioId,
        timestamp: Date.now(),
        data: { error: failResult.error },
      });
      return failResult;
    }

    // Synchronize
    const result = this.synchronizer.sync(studioId, pkg);
    this.metrics.record(result);

    if (result.success) {
      this.emit({
        type: "SyncCompleted",
        studioId,
        timestamp: Date.now(),
        data: {
          itemsSynced: result.itemsSynced,
          durationMs: result.durationMs,
        },
      });
    } else {
      this.emit({
        type: "SyncFailed",
        studioId,
        timestamp: Date.now(),
        data: { error: result.error },
      });
    }

    return result;
  }

  // ─── Query ────────────────────────────────────────────────────────────

  validatePackage(pkg: GenerationPackage): ImportValidationReport {
    return this.validator.validate(pkg);
  }
  getSession(studioId: string): StudioProjectSession | null {
    return this.registry.getSession(studioId);
  }
  getActiveSessions(): StudioProjectSession[] {
    return this.registry.getActiveSessions();
  }
  getMetrics(): StudioSyncMetricsData {
    return this.metrics.getMetrics();
  }
  getConnectionCount(): number {
    return this.registry.size;
  }

  // ─── Events ───────────────────────────────────────────────────────────

  on(listener: StudioEventListener): void {
    this.listeners.push(listener);
  }
  off(listener: StudioEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  private emit(event: StudioEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* non-blocking */
      }
    }
  }
}
