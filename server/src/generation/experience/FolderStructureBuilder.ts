/**
 * FolderStructureBuilder — Creates the standard Roblox service hierarchy.
 */

import type { ExperienceNode, RobloxService } from "./ExperienceTypes";
import type { LuaArtifact } from "../lua";

const SCRIPT_TYPE_TO_SERVICE: Record<string, RobloxService> = {
  ServerScript: "ServerScriptService",
  ModuleScript: "ReplicatedStorage",
  LocalScript: "StarterPlayer",
  ConfigurationModule: "ReplicatedStorage",
  RemoteEvents: "ReplicatedStorage",
  RemoteFunctions: "ReplicatedStorage",
  StarterPlayerScript: "StarterPlayer",
  ReplicatedModule: "ReplicatedStorage",
};

const PATH_SERVICE_MAP: Record<string, RobloxService> = {
  ServerScriptService: "ServerScriptService",
  ReplicatedStorage: "ReplicatedStorage",
  StarterPlayerScripts: "StarterPlayer",
  StarterGui: "StarterGui",
  Workspace: "Workspace",
  ServerStorage: "ServerStorage",
  Lighting: "Lighting",
  SoundService: "SoundService",
  StarterPack: "StarterPack",
};

export class FolderStructureBuilder {
  /**
   * Build the complete Roblox hierarchy from artifacts.
   */
  build(artifacts: LuaArtifact[]): ExperienceNode[] {
    const services = new Map<RobloxService, ExperienceNode>();

    // Initialize all services
    const allServices: RobloxService[] = [
      "ReplicatedStorage",
      "ServerScriptService",
      "StarterPlayer",
      "StarterGui",
      "Workspace",
      "Lighting",
      "SoundService",
      "ServerStorage",
      "StarterPack",
    ];

    for (const svc of allServices) {
      services.set(svc, {
        name: svc,
        type: "Folder",
        service: svc,
        path: svc,
        children: [],
      });
    }

    // Place each artifact into the correct service
    for (const artifact of artifacts) {
      const service = this.resolveService(artifact);
      const node = this.createNode(artifact, service);
      const serviceNode = services.get(service);
      if (serviceNode?.children) {
        serviceNode.children.push(node);
      }
    }

    // Return only services that have content
    return [...services.values()].filter((s) => (s.children?.length ?? 0) > 0);
  }

  private resolveService(artifact: LuaArtifact): RobloxService {
    // First check the artifact path for explicit service
    const pathParts = artifact.path.split("/");
    if (pathParts.length > 0) {
      const mapped = PATH_SERVICE_MAP[pathParts[0]];
      if (mapped) return mapped;
    }

    // Fall back to script type mapping
    return SCRIPT_TYPE_TO_SERVICE[artifact.scriptType] ?? "ReplicatedStorage";
  }

  private createNode(
    artifact: LuaArtifact,
    service: RobloxService,
  ): ExperienceNode {
    const nodeType = this.mapScriptType(artifact.scriptType);
    return {
      name: artifact.name,
      type: nodeType,
      service,
      path: artifact.path,
      content: artifact.content,
      artifactId: artifact.id,
    };
  }

  private mapScriptType(scriptType: string): ExperienceNode["type"] {
    switch (scriptType) {
      case "ServerScript":
        return "Script";
      case "LocalScript":
        return "LocalScript";
      default:
        return "ModuleScript";
    }
  }
}
