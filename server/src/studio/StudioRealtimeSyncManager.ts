/**
 * StudioRealtimeSyncManager.ts
 *
 * Maintains live bidirectional synchronization loop.
 * Detects Studio changes, pushes compiler updates, resolves conflicts.
 * Echo suppression prevents infinite sync loops.
 */

import type {
  StudioChange,
  SyncConflict,
  ResolvedState,
  CompilerUpdate,
} from "./StudioTypes";
import { StudioBridgeServer } from "./StudioBridgeServer";

export class StudioRealtimeSyncManager {
  private bridge: StudioBridgeServer;
  private activeSessions = new Set<string>();
  /** Recent changes pushed by us — used to suppress echoes */
  private recentPushes = new Map<string, number>();
  private echoWindowMs = 2000;
  private conflictHistory: SyncConflict[] = [];

  constructor(bridge: StudioBridgeServer) {
    this.bridge = bridge;
  }

  /**
   * Start real-time sync for a session.
   */
  startSync(sessionId: string): void {
    this.activeSessions.add(sessionId);
    console.log(`[SYNC] Started | Session: ${sessionId}`);
  }

  /**
   * Stop real-time sync for a session.
   */
  stopSync(sessionId: string): void {
    this.activeSessions.delete(sessionId);
    console.log(`[SYNC] Stopped | Session: ${sessionId}`);
  }

  /**
   * Handle an incoming change from Studio.
   * Checks for echo suppression before processing.
   */
  handleStudioChange(change: StudioChange): boolean {
    // Echo suppression: ignore if we recently pushed this change
    const echoKey = `${change.instanceId}:${change.changeType}`;
    const lastPush = this.recentPushes.get(echoKey);
    if (lastPush && Date.now() - lastPush < this.echoWindowMs) {
      return false; // Suppressed echo
    }

    console.log(
      `[SYNC] Studio change | Instance: ${change.instanceId} | Type: ${change.changeType}`,
    );
    return true; // Change accepted for processing
  }

  /**
   * Push a compiler update to Studio.
   * Records the push for echo suppression.
   */
  pushToStudio(studioId: string, update: CompilerUpdate): void {
    if (!this.activeSessions.has(studioId)) return;

    // Record for echo suppression
    const echoKey = `${(update.payload as any)?.instanceId ?? "unknown"}:modified`;
    this.recentPushes.set(echoKey, Date.now());

    this.bridge.sendUpdate(studioId, update);

    // Clean old echo entries
    this.cleanEchoEntries();
  }

  /**
   * Resolve a sync conflict using deterministic rules.
   * Default: compiler wins for scripts/config, Studio wins for scene/assets.
   */
  resolveConflict(conflict: SyncConflict): ResolvedState {
    // Deterministic resolution rules
    const scriptFields = ["Source", "code", "script"];
    const isScriptConflict = scriptFields.some((f) =>
      conflict.field.includes(f),
    );

    let resolution: ResolvedState["resolution"];
    let finalValue: unknown;

    if (isScriptConflict) {
      // Compiler is authoritative for code
      resolution = "use-compiler";
      finalValue = conflict.compilerValue;
    } else {
      // Studio is authoritative for visual/scene data
      resolution = "use-studio";
      finalValue = conflict.studioValue;
    }

    const resolved: ResolvedState = {
      conflictId: conflict.conflictId,
      resolution,
      finalValue,
    };

    this.conflictHistory.push(conflict);

    console.log(
      `[SYNC] Conflict resolved | Field: ${conflict.field} | Resolution: ${resolution}`,
    );

    return resolved;
  }

  /**
   * Check if a session is actively syncing.
   */
  isSyncing(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  getConflictHistory(): ReadonlyArray<SyncConflict> {
    return this.conflictHistory;
  }

  get activeSyncCount(): number {
    return this.activeSessions.size;
  }

  private cleanEchoEntries(): void {
    const now = Date.now();
    for (const [key, time] of this.recentPushes) {
      if (now - time > this.echoWindowMs * 2) {
        this.recentPushes.delete(key);
      }
    }
  }
}
