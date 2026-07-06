/**
 * FolderGenerator.ts — Sets up the standard Roblox folder hierarchy.
 */

import {
  BaseGenerator,
  type GeneratorInput,
  type GeneratorOutput,
  type GeneratorMetadata,
} from "../BaseGenerator";

export class FolderGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "folder-generator",
    name: "Folder Generator",
    version: "1.0.0",
    dependencies: [],
    produces: ["folders"],
  };

  async generate(input: GeneratorInput): Promise<GeneratorOutput> {
    const start = Date.now();
    const { model } = input;
    const modifications: string[] = [];

    const standardFolders = [
      {
        path: "ServerScriptService",
        parent: "game",
        purpose: "Server-side scripts",
      },
      {
        path: "ServerScriptService/Services",
        parent: "ServerScriptService",
        purpose: "Game services",
      },
      {
        path: "ReplicatedStorage",
        parent: "game",
        purpose: "Shared assets and modules",
      },
      {
        path: "ReplicatedStorage/Modules",
        parent: "ReplicatedStorage",
        purpose: "Shared ModuleScripts",
      },
      {
        path: "ReplicatedStorage/Events",
        parent: "ReplicatedStorage",
        purpose: "RemoteEvents and RemoteFunctions",
      },
      {
        path: "ReplicatedStorage/Assets",
        parent: "ReplicatedStorage",
        purpose: "Shared assets",
      },
      {
        path: "StarterPlayerScripts",
        parent: "StarterPlayer",
        purpose: "Client-side scripts",
      },
      { path: "StarterGui", parent: "game", purpose: "UI screens" },
      {
        path: "StarterGui/Screens",
        parent: "StarterGui",
        purpose: "Screen GUIs",
      },
      { path: "Workspace", parent: "game", purpose: "3D world objects" },
      { path: "ServerStorage", parent: "game", purpose: "Server-only assets" },
      { path: "Lighting", parent: "game", purpose: "Lighting and atmosphere" },
    ];

    // Replace defaults with full set
    model.folders = [];
    for (const folder of standardFolders) {
      if (!model.folders.some((f) => f.path === folder.path)) {
        model.folders.push(folder);
        modifications.push(folder.path);
      }
    }

    return {
      generatorId: this.metadata.id,
      success: true,
      modifications,
      durationMs: Date.now() - start,
    };
  }
}
