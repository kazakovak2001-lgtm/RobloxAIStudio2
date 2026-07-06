/**
 * FolderBuilder.ts — Converts FolderDefinitions into Folder nodes.
 */

import type { FolderDefinition } from "../GenerationModel";
import type { ProjectNode } from "../model/RobloxProjectModel";

export class FolderBuilder {
  build(folders: FolderDefinition[]): ProjectNode[] {
    return folders.map((f) => ({
      name: f.path.split("/").pop() ?? f.path,
      type: "Folder" as const,
      path: f.path,
      properties: { purpose: f.purpose },
    }));
  }
}
