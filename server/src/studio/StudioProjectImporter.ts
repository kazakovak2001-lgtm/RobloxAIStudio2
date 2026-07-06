/**
 * StudioProjectImporter.ts
 *
 * Imports a full Roblox Studio experience into the compiler system.
 * Extracts assets, scripts, scene graph, and bootstraps a compiler project.
 */

import type {
  RobloxWorkspace,
  RobloxInstance,
  ImportValidationResult,
} from "./StudioTypes";
import type { ProjectAssembly } from "../assembly/AssemblyTypes";
import { StudioAssetMapper } from "./StudioAssetMapper";
import { SceneGraphTranslator } from "./SceneGraphTranslator";

export class StudioProjectImporter {
  private assetMapper = new StudioAssetMapper();
  private sceneTranslator = new SceneGraphTranslator();

  /**
   * Import a full Roblox Studio project into a ProjectAssembly.
   */
  importProject(
    studioProjectId: string,
    workspace: RobloxWorkspace,
  ): ProjectAssembly {
    const startTime = Date.now();

    // Build scene graph
    this.sceneTranslator.buildSceneGraph(workspace);
    const worldEntries = this.sceneTranslator.toWorkspaceEntries();

    // Extract and map assets
    const assets = this.extractAssets(workspace);

    // Extract scripts
    const scripts = this.extractScripts(workspace, "Script");
    const clientScripts = this.extractScripts(workspace, "LocalScript");
    const modules = this.extractScripts(workspace, "ModuleScript");

    // Build assembly
    const assembly: ProjectAssembly = {
      id: `import-${studioProjectId}-${Date.now()}`,
      generationId: studioProjectId,
      schemaVersion: "1.0.0",
      createdAt: new Date(),
      status: "complete",
      services: [...workspace.services] as any,
      folders: [],
      scripts: scripts.map((s, i) => ({
        id: `imp-script-${i}`,
        name: s.name,
        type: "Script" as const,
        service: "ServerScriptService" as const,
        path: `ServerScriptService/${s.name}`,
        code: String(s.properties.Source ?? ""),
      })),
      modules: modules.map((s, i) => ({
        id: `imp-module-${i}`,
        name: s.name,
        type: "ModuleScript" as const,
        service: "ReplicatedStorage" as const,
        path: `ReplicatedStorage/${s.name}`,
        code: String(s.properties.Source ?? ""),
      })),
      ui: clientScripts.map((s, i) => ({
        id: `imp-local-${i}`,
        name: s.name,
        type: "LocalScript" as const,
        service: "StarterPlayer" as const,
        path: `StarterPlayer/${s.name}`,
        code: String(s.properties.Source ?? ""),
      })),
      world: worldEntries,
      assets,
      network: [],
      configuration: [],
      build: {
        totalServices: workspace.services.length,
        totalFolders: 0,
        totalScripts: scripts.length,
        totalModules: modules.length,
        totalAssets: assets.length,
        totalNetworkObjects: 0,
        totalWorkspaceEntries: worldEntries.length,
        totalConfigurations: 0,
        buildTimeMs: Date.now() - startTime,
      },
    };

    console.log(
      `[IMPORT] Project imported | Studio: ${studioProjectId} | ` +
        `Scripts: ${scripts.length} | Modules: ${modules.length} | ` +
        `Assets: ${assets.length} | World: ${worldEntries.length}`,
    );

    return assembly;
  }

  /**
   * Validate an import before committing.
   */
  validateImport(workspace: RobloxWorkspace): ImportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (workspace.instances.size === 0) {
      errors.push("Workspace contains no instances");
    }

    const scripts = this.extractScripts(workspace, "Script");
    const localScripts = this.extractScripts(workspace, "LocalScript");
    const moduleScripts = this.extractScripts(workspace, "ModuleScript");

    if (scripts.length === 0 && moduleScripts.length === 0) {
      warnings.push("No server scripts or modules found");
    }

    const assets = this.extractAssets(workspace);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      instanceCount: workspace.instances.size,
      scriptCount: scripts.length + localScripts.length + moduleScripts.length,
      assetCount: assets.length,
    };
  }

  private extractScripts(
    workspace: RobloxWorkspace,
    className: string,
  ): RobloxInstance[] {
    const results: RobloxInstance[] = [];
    for (const instance of workspace.instances.values()) {
      if (instance.className === className) {
        results.push(instance);
      }
    }
    return results;
  }

  private extractAssets(workspace: RobloxWorkspace) {
    const assetClasses = new Set([
      "MeshPart",
      "Sound",
      "Texture",
      "Decal",
      "Animation",
      "ParticleEmitter",
    ]);
    const assets = [];
    for (const instance of workspace.instances.values()) {
      if (assetClasses.has(instance.className)) {
        assets.push(this.assetMapper.mapInstance(instance));
      }
    }
    return assets;
  }
}
