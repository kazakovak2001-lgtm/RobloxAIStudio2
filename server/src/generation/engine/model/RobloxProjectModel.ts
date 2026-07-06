/**
 * RobloxProjectModel.ts
 *
 * Represents the complete Roblox project hierarchy (DataModel).
 * No Roblox Studio API calls — pure structural representation.
 */

export interface RobloxProjectModel {
  name: string;
  dataModel: DataModelNode;
  metadata: { createdAt: number; version: string; generatorVersion: string };
}

export interface DataModelNode {
  serverScriptService: ServiceContainer;
  replicatedStorage: ServiceContainer;
  starterPlayer: StarterPlayerContainer;
  starterGui: ServiceContainer;
  workspace: ServiceContainer;
  lighting: ServiceContainer;
  soundService: ServiceContainer;
  serverStorage: ServiceContainer;
}

export interface ServiceContainer {
  name: string;
  children: ProjectNode[];
}

export interface StarterPlayerContainer {
  name: string;
  starterPlayerScripts: ServiceContainer;
  starterCharacterScripts: ServiceContainer;
}

export interface ProjectNode {
  name: string;
  type:
    | "Script"
    | "LocalScript"
    | "ModuleScript"
    | "Folder"
    | "Configuration"
    | "Model";
  path: string;
  content?: string;
  children?: ProjectNode[];
  properties?: Record<string, unknown>;
}

/**
 * Create an empty Roblox project model with standard structure.
 */
export function createEmptyProjectModel(name: string): RobloxProjectModel {
  return {
    name,
    dataModel: {
      serverScriptService: { name: "ServerScriptService", children: [] },
      replicatedStorage: { name: "ReplicatedStorage", children: [] },
      starterPlayer: {
        name: "StarterPlayer",
        starterPlayerScripts: { name: "StarterPlayerScripts", children: [] },
        starterCharacterScripts: {
          name: "StarterCharacterScripts",
          children: [],
        },
      },
      starterGui: { name: "StarterGui", children: [] },
      workspace: { name: "Workspace", children: [] },
      lighting: { name: "Lighting", children: [] },
      soundService: { name: "SoundService", children: [] },
      serverStorage: { name: "ServerStorage", children: [] },
    },
    metadata: {
      createdAt: Date.now(),
      version: "1.0.0",
      generatorVersion: "2.3.0",
    },
  };
}
