/**
 * Lua Generation Types — Core types for the Roblox Lua code generation engine.
 */

export type LuaScriptType =
  | "ServerScript"
  | "LocalScript"
  | "ModuleScript"
  | "ConfigurationModule"
  | "RemoteEvents"
  | "RemoteFunctions"
  | "StarterPlayerScript"
  | "ReplicatedModule";

export type GameplaySystem =
  | "gameplay"
  | "combat"
  | "inventory"
  | "npc"
  | "dialogue"
  | "quest"
  | "economy"
  | "lobby"
  | "datastore"
  | "ui"
  | "player"
  | "config"
  | "remotes";

export interface LuaArtifact {
  id: string;
  name: string;
  scriptType: LuaScriptType;
  path: string;
  content: string;
  dependencies: string[];
  generatedByAgent: string;
  generationTime: number;
  validationScore: number;
  system: GameplaySystem;
  sizeBytes: number;
}

export interface LuaGenerationRequest {
  projectId: string;
  gameName: string;
  genre: string;
  systems: GameplaySystem[];
  architecture?: string;
  features?: string[];
}

export interface LuaGenerationResult {
  projectId: string;
  artifacts: LuaArtifact[];
  manifest: ArtifactManifest;
  totalScripts: number;
  totalSizeBytes: number;
  generationTimeMs: number;
  validationPassed: boolean;
}

export interface ArtifactManifest {
  projectId: string;
  generatedAt: number;
  version: string;
  artifacts: Array<{
    artifactId: string;
    scriptType: LuaScriptType;
    path: string;
    dependencies: string[];
    generatedByAgent: string;
    generationTime: number;
    validationScore: number;
  }>;
  totalScripts: number;
  totalSizeBytes: number;
}

export interface ValidationReport {
  scriptName: string;
  score: number;
  passed: boolean;
  errors: string[];
  warnings: string[];
}
