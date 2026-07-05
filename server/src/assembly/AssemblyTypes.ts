/**
 * AssemblyTypes.ts — All type definitions for Project Assembly & Workspace Builder (v0.95).
 */

// ─── Roblox Services ──────────────────────────────────────────────────────────

export type RobloxService =
  | "Workspace"
  | "ReplicatedStorage"
  | "ReplicatedFirst"
  | "ServerScriptService"
  | "ServerStorage"
  | "StarterPlayer"
  | "StarterGui"
  | "StarterPack"
  | "Lighting"
  | "Teams"
  | "SoundService"
  | "Chat"
  | "TextChatService"
  | "CollectionService"
  | "RunService"
  | "InsertService"
  | "TeleportService";

export const ALL_ROBLOX_SERVICES: RobloxService[] = [
  "Workspace",
  "ReplicatedStorage",
  "ReplicatedFirst",
  "ServerScriptService",
  "ServerStorage",
  "StarterPlayer",
  "StarterGui",
  "StarterPack",
  "Lighting",
  "Teams",
  "SoundService",
  "Chat",
  "TextChatService",
  "CollectionService",
  "RunService",
  "InsertService",
  "TeleportService",
];

// ─── Script types ─────────────────────────────────────────────────────────────

export type ScriptType = "Script" | "LocalScript" | "ModuleScript";

export interface AssemblyScript {
  id: string;
  name: string;
  type: ScriptType;
  service: RobloxService;
  path: string; // full path: "ServerScriptService/GameManager"
  code: string;
  tags?: string[];
}

// ─── Folder model ─────────────────────────────────────────────────────────────

export interface AssemblyFolder {
  name: string;
  service: RobloxService;
  path: string;
  children: string[]; // child folder/script names
  purpose?: string;
}

// ─── Asset placeholder ────────────────────────────────────────────────────────

export type AssetType =
  | "Model"
  | "Texture"
  | "Material"
  | "Mesh"
  | "Animation"
  | "Audio"
  | "Particle"
  | "Icon"
  | "UIGraphic";

export interface AssetPlaceholder {
  id: string;
  name: string;
  type: AssetType;
  service: RobloxService;
  path: string;
  description?: string;
  properties?: Record<string, unknown>;
}

// ─── Networking ───────────────────────────────────────────────────────────────

export type NetworkObjectType =
  | "RemoteEvent"
  | "RemoteFunction"
  | "BindableEvent"
  | "BindableFunction";

export interface NetworkObject {
  id: string;
  name: string;
  type: NetworkObjectType;
  service: "ReplicatedStorage";
  path: string;
  direction:
    | "client-to-server"
    | "server-to-client"
    | "bidirectional"
    | "internal";
  description?: string;
}

// ─── Workspace model ──────────────────────────────────────────────────────────

export interface WorkspaceEntry {
  id: string;
  name: string;
  type:
    | "Folder"
    | "Model"
    | "SpawnLocation"
    | "Terrain"
    | "NPC"
    | "Interactive"
    | "Tag"
    | "Collection";
  path: string;
  properties?: Record<string, unknown>;
  tags?: string[];
}

// ─── Assembly configuration ───────────────────────────────────────────────────

export interface AssemblyConfig {
  name: string;
  key: string;
  service: RobloxService;
  path: string;
  value: unknown;
}

// ─── Build info ───────────────────────────────────────────────────────────────

export interface AssemblyBuildInfo {
  totalServices: number;
  totalFolders: number;
  totalScripts: number;
  totalModules: number;
  totalAssets: number;
  totalNetworkObjects: number;
  totalWorkspaceEntries: number;
  totalConfigurations: number;
  buildTimeMs: number;
}

// ─── Assembly Manifest ────────────────────────────────────────────────────────

export interface AssemblyManifest {
  assemblyId: string;
  generationId: string;
  pipelineVersion: string;
  assemblyVersion: string;
  blueprintVersion: string;
  createdAt: Date;
  buildTimeMs: number;
  services: RobloxService[];
  scripts: number;
  modules: number;
  assets: number;
  warnings: string[];
  recommendations: string[];
  validationScore: number;
}

// ─── Assembly Validation ──────────────────────────────────────────────────────

export interface AssemblyValidationIssue {
  code: string;
  section: string;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface AssemblyValidationResult {
  status: "passed" | "warnings" | "failed";
  score: number;
  issues: AssemblyValidationIssue[];
  warnings: string[];
  errors: string[];
}

// ─── Master Assembly ──────────────────────────────────────────────────────────

export interface ProjectAssembly {
  id: string;
  generationId: string;
  schemaVersion: string;
  createdAt: Date;
  status: "building" | "validated" | "complete" | "failed";

  services: RobloxService[];
  folders: AssemblyFolder[];
  scripts: AssemblyScript[];
  modules: AssemblyScript[]; // ModuleScripts separated for clarity
  ui: AssemblyScript[]; // StarterGui scripts
  world: WorkspaceEntry[];
  assets: AssetPlaceholder[];
  network: NetworkObject[];
  configuration: AssemblyConfig[];

  build: AssemblyBuildInfo;
  manifest?: AssemblyManifest;
  validation?: AssemblyValidationResult;
}
