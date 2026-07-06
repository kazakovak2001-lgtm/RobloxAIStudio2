/**
 * GenerationModel.ts
 *
 * Canonical in-memory representation of a complete generated Roblox experience.
 * This model is the single source of truth between generators and artifact builders.
 */

import { randomUUID } from "crypto";

export interface GenerationModel {
  id: string;
  version: string;
  createdAt: number;

  game: GameMetadata;
  services: ServiceDefinition[];
  folders: FolderDefinition[];
  scripts: ScriptDefinition[];
  modules: ModuleDefinition[];
  assets: AssetDefinition[];
  ui: UIDefinition[];
  networking: NetworkingDefinition;
  configuration: ConfigurationSet;
  dependencies: DependencyEntry[];
}

export interface GameMetadata {
  title: string;
  genre: string;
  description: string;
  targetAudience: string;
  mechanics: string[];
  maxPlayers: number;
}

export interface ServiceDefinition {
  name: string;
  type: "server" | "client" | "shared";
  description: string;
  dependencies: string[];
}

export interface FolderDefinition {
  path: string;
  parent: string;
  purpose: string;
}

export interface ScriptDefinition {
  id: string;
  name: string;
  path: string;
  scriptType: "server" | "client" | "module";
  content: string;
  dependencies: string[];
  generatedBy: string;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  path: string;
  exports: string[];
  dependencies: string[];
  generatedBy: string;
}

export interface AssetDefinition {
  id: string;
  name: string;
  assetType: "model" | "texture" | "sound" | "animation" | "mesh";
  path: string;
  metadata: Record<string, unknown>;
}

export interface UIDefinition {
  id: string;
  name: string;
  screenType: "hud" | "menu" | "dialog" | "overlay";
  elements: UIElement[];
  generatedBy: string;
}

export interface UIElement {
  type: string;
  name: string;
  properties: Record<string, unknown>;
  children?: UIElement[];
}

export interface NetworkingDefinition {
  remoteEvents: Array<{
    name: string;
    direction: "server-to-client" | "client-to-server" | "bidirectional";
    payload: string;
  }>;
  remoteFunctions: Array<{
    name: string;
    parameters: string;
    returnType: string;
  }>;
}

export interface ConfigurationSet {
  gameSettings: Record<string, unknown>;
  serverSettings: Record<string, unknown>;
  clientSettings: Record<string, unknown>;
}

export interface DependencyEntry {
  from: string;
  to: string;
  type: "requires" | "uses" | "extends";
}

/**
 * Create an empty generation model scaffold.
 */
export function createEmptyModel(game: GameMetadata): GenerationModel {
  return {
    id: `model-${randomUUID().slice(0, 12)}`,
    version: "1.0.0",
    createdAt: Date.now(),
    game,
    services: [],
    folders: [],
    scripts: [],
    modules: [],
    assets: [],
    ui: [],
    networking: { remoteEvents: [], remoteFunctions: [] },
    configuration: { gameSettings: {}, serverSettings: {}, clientSettings: {} },
    dependencies: [],
  };
}
