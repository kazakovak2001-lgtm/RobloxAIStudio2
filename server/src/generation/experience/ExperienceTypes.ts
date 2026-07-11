/**
 * Experience Assembly Types — Defines the structure of a complete Roblox Experience.
 */

export type RobloxService =
  | "ReplicatedStorage"
  | "ServerScriptService"
  | "StarterPlayer"
  | "StarterGui"
  | "Workspace"
  | "Lighting"
  | "SoundService"
  | "ServerStorage"
  | "StarterPack";

export interface ExperienceNode {
  name: string;
  type: "Folder" | "ModuleScript" | "Script" | "LocalScript" | "Configuration";
  service: RobloxService;
  path: string;
  content?: string;
  children?: ExperienceNode[];
  artifactId?: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "require" | "remote_event" | "remote_function" | "config";
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
  initOrder: string[];
  circular: string[][];
}

export interface ExperienceManifestData {
  projectId: string;
  conceptId?: string;
  pipelineId?: string;
  generatedAt: number;
  version: string;
  artifacts: Array<{
    id: string;
    name: string;
    scriptType: string;
    service: RobloxService;
    path: string;
    dependencies: string[];
    validationScore: number;
  }>;
  dependencyGraph: DependencyGraph;
  hierarchy: ExperienceNode[];
  validationScore: number;
  totalScripts: number;
  totalSizeBytes: number;
}

export interface ExperienceValidationReport {
  valid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  missingScripts: string[];
  duplicateNames: string[];
  invalidPlacements: string[];
  unresolvedDependencies: string[];
  circularReferences: string[][];
}
