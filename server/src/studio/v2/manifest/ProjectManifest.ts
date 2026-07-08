/**
 * ProjectManifest — Source of truth for Roblox project export.
 */

export interface ProjectManifest {
  projectId: string;
  gameName: string;
  scripts: Array<{
    name: string;
    path: string;
    type: "server" | "client" | "module";
  }>;
  assets: Array<{ name: string; assetType: string; path: string }>;
  folders: string[];
  dependencies: Array<{ from: string; to: string }>;
  generatedBy: string;
  version: string;
  createdAt: number;
}

export class ManifestBuilder {
  private manifest: ProjectManifest;

  constructor(projectId: string, gameName: string) {
    this.manifest = {
      projectId,
      gameName,
      scripts: [],
      assets: [],
      folders: [],
      dependencies: [],
      generatedBy: "RobloxAiStudio",
      version: "1.0.0",
      createdAt: Date.now(),
    };
  }

  addScript(
    name: string,
    path: string,
    type: "server" | "client" | "module",
  ): this {
    this.manifest.scripts.push({ name, path, type });
    return this;
  }
  addAsset(name: string, assetType: string, path: string): this {
    this.manifest.assets.push({ name, assetType, path });
    return this;
  }
  addFolder(path: string): this {
    this.manifest.folders.push(path);
    return this;
  }
  addDependency(from: string, to: string): this {
    this.manifest.dependencies.push({ from, to });
    return this;
  }
  setVersion(version: string): this {
    this.manifest.version = version;
    return this;
  }

  build(): ProjectManifest {
    return { ...this.manifest };
  }

  static fromPipelineOutput(
    projectId: string,
    gameName: string,
    outputs: Record<string, unknown>,
  ): ProjectManifest {
    const builder = new ManifestBuilder(projectId, gameName);
    // Extract scripts from lua_generator output
    const luaOutput = outputs["lua_generator"] as
      Record<string, unknown> | undefined;
    if (luaOutput) {
      for (const type of ["server", "client", "shared"] as const) {
        const scripts = (luaOutput[type] ?? []) as Array<{ name?: string }>;
        for (const s of scripts) {
          if (s.name)
            builder.addScript(
              s.name,
              `${type}/${s.name}.lua`,
              type === "shared" ? "module" : type,
            );
        }
      }
    }
    builder.addFolder("ServerScriptService");
    builder.addFolder("ReplicatedStorage");
    builder.addFolder("StarterPlayerScripts");
    builder.addFolder("StarterGui");
    return builder.build();
  }
}
