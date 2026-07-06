/**
 * PackageSynchronizer.ts
 *
 * Synchronizes a GenerationPackage to a connected Studio instance
 * through the existing StudioBridgeServer.
 */

import type { GenerationPackage } from "../../generation/coordinator/types";
import { StudioBridgeServer } from "../StudioBridgeServer";
import type { CompilerUpdate } from "../StudioTypes";
import { StudioImportValidator } from "./StudioImportValidator";
import { ProjectDiffEngine } from "./ProjectDiffEngine";
import { StudioConnectionRegistry } from "./StudioConnectionRegistry";
import type { SyncPayload, SyncResult, ProjectDiff } from "./types";
import { createSyncPayloadId } from "./types";

export class PackageSynchronizer {
  private bridge: StudioBridgeServer;
  private registry: StudioConnectionRegistry;
  private validator: StudioImportValidator;
  private diffEngine: ProjectDiffEngine;
  private previousStates: Map<string, Map<string, string>> = new Map(); // studioId → hash map

  constructor(bridge: StudioBridgeServer, registry: StudioConnectionRegistry) {
    this.bridge = bridge;
    this.registry = registry;
    this.validator = new StudioImportValidator();
    this.diffEngine = new ProjectDiffEngine();
  }

  /**
   * Synchronize a package to a Studio instance. Returns sync result.
   */
  sync(studioId: string, pkg: GenerationPackage): SyncResult {
    const start = Date.now();
    const session = this.registry.getSession(studioId);

    if (!session) {
      return {
        success: false,
        sessionId: "",
        payloadId: "",
        itemsSynced: 0,
        totalSize: 0,
        durationMs: Date.now() - start,
        error: "Studio not connected",
      };
    }

    // Validate package before sync
    const validation = this.validator.validate(pkg);
    if (!validation.valid) {
      return {
        success: false,
        sessionId: session.sessionId,
        payloadId: "",
        itemsSynced: 0,
        totalSize: 0,
        durationMs: Date.now() - start,
        error: `Validation failed: ${validation.errors.join("; ")}`,
      };
    }

    // Compute diff (incremental sync)
    const previousState = this.previousStates.get(studioId) ?? null;
    const diff = this.diffEngine.computeDiff(previousState, pkg);

    // Build sync payload
    const payload = this.buildPayload(session.sessionId, pkg.packageId, diff);

    // Send through bridge
    this.registry.updateSessionStatus(studioId, "syncing");
    for (const item of payload.items) {
      const update: CompilerUpdate = {
        updateId: `update-${Date.now()}-${item.path}`,
        projectId: session.projectId,
        type: this.mapItemType(item.type),
        payload: {
          path: item.path,
          action: item.action,
          content: item.content,
        },
        timestamp: new Date(),
      };
      this.bridge.sendUpdate(studioId, update);
    }

    // Save state for future diffs
    this.previousStates.set(studioId, this.diffEngine.buildHashMap(pkg));
    session.lastSyncAt = Date.now();
    session.syncCount++;
    session.version++;
    session.packageId = pkg.packageId;
    this.registry.updateSessionStatus(studioId, "completed");

    return {
      success: true,
      sessionId: session.sessionId,
      payloadId: payload.payloadId,
      itemsSynced: payload.items.length,
      totalSize: payload.totalSize,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Get the last diff computed for a Studio instance.
   */
  getLastDiff(studioId: string, pkg: GenerationPackage): ProjectDiff {
    const previous = this.previousStates.get(studioId) ?? null;
    return this.diffEngine.computeDiff(previous, pkg);
  }

  private buildPayload(
    sessionId: string,
    packageId: string,
    diff: ProjectDiff,
  ): SyncPayload {
    const items = [...diff.added, ...diff.modified, ...diff.removed];
    return {
      payloadId: createSyncPayloadId(),
      sessionId,
      packageId,
      items,
      totalSize: items.reduce((sum, i) => sum + i.size, 0),
      createdAt: Date.now(),
    };
  }

  private mapItemType(type: string): CompilerUpdate["type"] {
    switch (type) {
      case "script":
        return "script";
      case "module":
        return "script";
      case "config":
        return "config";
      case "asset":
        return "asset";
      default:
        return "full";
    }
  }
}
