import type {
  ProjectAssembly,
  AssemblyManifest,
  RobloxService,
} from "./AssemblyTypes";
import { ALL_ROBLOX_SERVICES } from "./AssemblyTypes";
import type { GameBlueprint } from "../generation/GenerationBlueprint";
import type { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../execution/pipelineTypes";
import { FolderMapper } from "./FolderMapper";
import { ScriptAssembler } from "./ScriptAssembler";
import { WorkspaceBuilder } from "./WorkspaceBuilder";
import { AssemblyValidator } from "./AssemblyValidator";
import {
  AssemblyRegistry,
  getDefaultAssemblyRegistry,
} from "./AssemblyRegistry";
import { CURRENT_VERSIONS } from "../generation/GenerationTypes";

/**
 * AssemblyBuilder
 *
 * Transforms a validated GameBlueprint into a complete ProjectAssembly
 * that mirrors a Roblox experience structure.
 *
 * Orchestrates: FolderMapper → ScriptAssembler → WorkspaceBuilder →
 *               AssemblyValidator → AssemblyManifest → Store
 */
export class AssemblyBuilder {
  private folderMapper = new FolderMapper();
  private scriptAssembler = new ScriptAssembler();
  private workspaceBuilder = new WorkspaceBuilder();
  private validator = new AssemblyValidator();
  private registry: AssemblyRegistry;

  constructor(
    private readonly events: PipelineEventEmitter,
    registry?: AssemblyRegistry,
  ) {
    this.registry = registry ?? getDefaultAssemblyRegistry();
  }

  /**
   * Build a complete ProjectAssembly from a GameBlueprint.
   */
  async build(blueprint: GameBlueprint): Promise<ProjectAssembly> {
    const buildStart = Date.now();
    const assemblyId = `asm-${blueprint.id}-${Date.now()}`;

    await this.emit("assembly.started", blueprint.id, {
      assemblyId,
      generationId: blueprint.id,
    });

    // ── Folder mapping ──────────────────────────────────────────────────────
    const folders = this.folderMapper.mapFolders(blueprint);

    await this.emit("assembly.mapping.completed", blueprint.id, {
      folders: folders.length,
      rules: "default",
    });

    // ── Script assembly ─────────────────────────────────────────────────────
    const { scripts, modules, ui } = this.scriptAssembler.assemble(blueprint);

    // ── Workspace building ──────────────────────────────────────────────────
    const { world, assets, network, configuration } =
      this.workspaceBuilder.build(blueprint);

    await this.emit("assembly.workspace.created", blueprint.id, {
      services: ALL_ROBLOX_SERVICES.length,
      folders: folders.length,
      scripts: scripts.length + modules.length + ui.length,
      world: world.length,
      assets: assets.length,
      network: network.length,
    });

    // ── Determine active services ───────────────────────────────────────────
    const usedServices = new Set<RobloxService>();
    for (const f of folders) usedServices.add(f.service);
    for (const s of [...scripts, ...modules, ...ui])
      usedServices.add(s.service);
    const services = ALL_ROBLOX_SERVICES.filter((s) => usedServices.has(s));

    const buildTimeMs = Date.now() - buildStart;

    // ── Assemble ────────────────────────────────────────────────────────────
    const assembly: ProjectAssembly = {
      id: assemblyId,
      generationId: blueprint.id,
      schemaVersion: "1.0.0",
      createdAt: new Date(),
      status: "building",
      services,
      folders,
      scripts,
      modules,
      ui,
      world,
      assets,
      network,
      configuration,
      build: {
        totalServices: services.length,
        totalFolders: folders.length,
        totalScripts: scripts.length,
        totalModules: modules.length,
        totalAssets: assets.length,
        totalNetworkObjects: network.length,
        totalWorkspaceEntries: world.length,
        totalConfigurations: configuration.length,
        buildTimeMs,
      },
    };

    // ── Validation ──────────────────────────────────────────────────────────
    const validation = this.validator.validate(assembly);
    assembly.validation = validation;

    await this.emit("assembly.validation.completed", blueprint.id, {
      score: validation.score,
      status: validation.status,
      warnings: validation.warnings.length,
      errors: validation.errors.length,
    });

    // ── Manifest ────────────────────────────────────────────────────────────
    const manifest: AssemblyManifest = {
      assemblyId,
      generationId: blueprint.id,
      pipelineVersion: CURRENT_VERSIONS.generationPipeline,
      assemblyVersion: "0.95.0",
      blueprintVersion: blueprint.schemaVersion,
      createdAt: new Date(),
      buildTimeMs,
      services,
      scripts: scripts.length + ui.length,
      modules: modules.length,
      assets: assets.length,
      warnings: validation.warnings,
      recommendations: [
        "Export assembly to .rbxl via Rojo (future milestone)",
        "Generate actual Lua optimizations (future milestone)",
      ],
      validationScore: validation.score,
    };
    assembly.manifest = manifest;

    // ── Finalize ────────────────────────────────────────────────────────────
    assembly.status = validation.status === "failed" ? "failed" : "complete";

    this.registry.store(assembly);

    const eventType =
      assembly.status === "complete" ? "assembly.completed" : "assembly.failed";
    await this.emit(eventType, blueprint.id, {
      assemblyId,
      status: assembly.status,
      validationScore: validation.score,
      buildTimeMs,
      services: services.length,
      scripts: scripts.length + modules.length + ui.length,
    });

    console.log(
      `[ASSEMBLY] ${assembly.status === "complete" ? "Complete" : "Failed"} | ` +
        `Services: ${services.length} | Folders: ${folders.length} | Scripts: ${scripts.length + modules.length + ui.length} | ` +
        `Assets: ${assets.length} | Score: ${validation.score}`,
    );

    return assembly;
  }

  private async emit(
    type: string,
    pipelineId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.events.emit({
      type: type as PipelineEvent["type"],
      pipelineId,
      data,
      timestamp: new Date(),
    });
  }
}
