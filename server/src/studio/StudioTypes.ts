/**
 * StudioTypes.ts — All type definitions for the Roblox Studio Integration Layer.
 */

export type StudioConnectionStatus =
  "connected" | "disconnected" | "syncing" | "error";
export type SyncDirection =
  "studio-to-compiler" | "compiler-to-studio" | "bidirectional";

export interface RobloxInstance {
  instanceId: string;
  className: string;
  name: string;
  parent?: string;
  properties: Record<string, unknown>;
  children: string[];
}

export interface RobloxWorkspace {
  rootId: string;
  instances: Map<string, RobloxInstance>;
  services: string[];
}

export interface StudioEvent {
  eventId: string;
  studioId: string;
  type: string;
  timestamp: Date;
  payload: unknown;
}

export interface CompilerUpdate {
  updateId: string;
  projectId: string;
  type: "script" | "asset" | "config" | "scene" | "full";
  payload: unknown;
  timestamp: Date;
}

export interface StudioChange {
  changeId: string;
  studioId: string;
  instanceId: string;
  changeType: "added" | "removed" | "modified" | "moved";
  before?: unknown;
  after?: unknown;
  timestamp: Date;
}

export interface StudioState {
  studioId: string;
  status: StudioConnectionStatus;
  projectId?: string;
  lastSyncAt?: Date;
  instanceCount: number;
  pendingChanges: number;
}

export interface SyncConflict {
  conflictId: string;
  instanceId: string;
  field: string;
  compilerValue: unknown;
  studioValue: unknown;
  detectedAt: Date;
}

export interface ResolvedState {
  conflictId: string;
  resolution: "use-compiler" | "use-studio" | "merge";
  finalValue: unknown;
}

export interface AssetDiff {
  assetId: string;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
}

export interface SceneGraph {
  rootId: string;
  nodes: Map<string, SceneGraphNode>;
  edges: Array<{ parent: string; child: string }>;
}

export interface SceneGraphNode {
  id: string;
  className: string;
  name: string;
  properties: Record<string, unknown>;
  depth: number;
}

export interface SceneDiff {
  added: SceneGraphNode[];
  removed: string[];
  modified: Array<{ id: string; changes: Record<string, unknown> }>;
  moved: Array<{ id: string; newParent: string }>;
}

export interface SerializedScene {
  version: string;
  rootId: string;
  nodes: Array<SceneGraphNode & { parentId?: string }>;
  timestamp: Date;
}

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  instanceCount: number;
  scriptCount: number;
  assetCount: number;
}
