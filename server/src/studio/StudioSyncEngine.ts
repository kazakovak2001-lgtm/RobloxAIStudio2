/**
 * StudioSyncEngine.ts
 *
 * Core synchronization engine between Roblox Studio and compiler platform.
 * Orchestrates: bridge, asset mapping, scene graph, real-time sync.
 * Single entry point for all Studio integration operations.
 */

import type {
  StudioState,
  StudioChange,
  CompilerUpdate,
  RobloxWorkspace,
  SyncConflict,
  ResolvedState,
  ImportValidationResult,
} from "./StudioTypes";
import type { ProjectAssembly } from "../assembly/AssemblyTypes";
import { StudioBridgeServer } from "./StudioBridgeServer";
import { StudioAssetMapper } from "./StudioAssetMapper";
import { SceneGraphTranslator } from "./SceneGraphTranslator";
import { StudioProjectImporter } from "./StudioProjectImporter";
import { StudioRealtimeSyncManager } from "./StudioRealtimeSyncManager";

export class StudioSyncEngine {
  private bridge: StudioBridgeServer;
  private _assetMapper: StudioAssetMapper;
  private sceneTranslator: SceneGraphTranslator;
  private importer: StudioProjectImporter;
  private syncManager: StudioRealtimeSyncManager;
  private studioStates = new Map<string, StudioState>();

  constructor() {
    this.bridge = new StudioBridgeServer();
    this._assetMapper = new StudioAssetMapper();
    this.sceneTranslator = new SceneGraphTranslator();
    this.importer = new StudioProjectImporter();
    this.syncManager = new StudioRealtimeSyncManager(this.bridge);
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  /**
   * Connect a Roblox Studio instance.
   */
  connect(studioId: string, projectId?: string): StudioState {
    this.bridge.connectSession(studioId, projectId);
    const state: StudioState = {
      studioId,
      status: "connected",
      projectId,
      lastSyncAt: new Date(),
      instanceCount: 0,
      pendingChanges: 0,
    };
    this.studioStates.set(studioId, state);
    console.log(
      `[STUDIO] Connected | ID: ${studioId} | Project: ${projectId ?? "none"}`,
    );
    return state;
  }

  /**
   * Disconnect a Studio instance.
   */
  disconnect(studioId: string): void {
    this.syncManager.stopSync(studioId);
    this.bridge.disconnectSession(studioId);
    this.studioStates.delete(studioId);
    console.log(`[STUDIO] Disconnected | ID: ${studioId}`);
  }

  // ─── Sync ──────────────────────────────────────────────────────────────────

  /**
   * Get current sync state for a Studio instance.
   */
  syncState(studioId: string): StudioState | null {
    return this.studioStates.get(studioId) ?? null;
  }

  /**
   * Start real-time bidirectional sync.
   */
  startRealtimeSync(studioId: string): void {
    this.syncManager.startSync(studioId);
    const state = this.studioStates.get(studioId);
    if (state) state.status = "syncing";
  }

  /**
   * Stop real-time sync.
   */
  stopRealtimeSync(studioId: string): void {
    this.syncManager.stopSync(studioId);
    const state = this.studioStates.get(studioId);
    if (state) state.status = "connected";
  }

  /**
   * Push a compiler update to Studio.
   */
  pushUpdate(studioId: string, update: CompilerUpdate): void {
    this.syncManager.pushToStudio(studioId, update);
  }

  /**
   * Handle an incoming Studio change.
   * Returns true if the change was accepted (not an echo).
   */
  handleChange(change: StudioChange): boolean {
    return this.syncManager.handleStudioChange(change);
  }

  /**
   * Resolve a sync conflict.
   */
  resolveConflict(conflict: SyncConflict): ResolvedState {
    return this.syncManager.resolveConflict(conflict);
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  /**
   * Import a full Studio project into the compiler.
   */
  importProject(
    studioProjectId: string,
    workspace: RobloxWorkspace,
  ): ProjectAssembly {
    return this.importer.importProject(studioProjectId, workspace);
  }

  /**
   * Validate a Studio project before import.
   */
  validateImport(workspace: RobloxWorkspace): ImportValidationResult {
    return this.importer.validateImport(workspace);
  }

  // ─── Scene Graph ───────────────────────────────────────────────────────────

  /**
   * Build/update the scene graph from a workspace.
   */
  buildSceneGraph(workspace: RobloxWorkspace) {
    return this.sceneTranslator.buildSceneGraph(workspace);
  }

  /**
   * Get serialized scene graph.
   */
  getSerializedScene() {
    return this.sceneTranslator.serializeGraph();
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  getAssetMapper(): StudioAssetMapper {
    return this._assetMapper;
  }

  getConnectedStudios(): StudioState[] {
    return Array.from(this.studioStates.values());
  }

  isConnected(studioId: string): boolean {
    return this.studioStates.has(studioId);
  }

  getBridge(): StudioBridgeServer {
    return this.bridge;
  }
}
