import type {
  ProjectAssembly,
  AssemblyValidationResult,
} from "./AssemblyTypes";
import type { GameBlueprint } from "../generation/GenerationBlueprint";
import { FolderMapper } from "./FolderMapper";
import { ScriptAssembler } from "./ScriptAssembler";
import { WorkspaceBuilder } from "./WorkspaceBuilder";
import { AssemblyValidator } from "./AssemblyValidator";

/**
 * ReplayStep — one stage of the replay execution trace.
 */
export interface ReplayStep {
  stage: "load" | "map" | "assemble" | "build" | "validate";
  success: boolean;
  durationMs: number;
  inputState?: Record<string, unknown>;
  outputState?: Record<string, unknown>;
  error?: string;
}

/**
 * ReplayResult — complete result of replaying an assembly.
 */
export interface ReplayResult {
  assemblyId: string;
  version: string;
  reconstructed: ProjectAssembly;
  validation: AssemblyValidationResult;
  executionTrace: ReplayStep[];
  totalDurationMs: number;
  deterministic: boolean;
}

/**
 * AssemblyReplayEngine
 *
 * Re-executes the assembly pipeline from a stored snapshot.
 * Simulates the full build lifecycle deterministically.
 * Does NOT modify stored snapshots — read-only operation.
 */
export class AssemblyReplayEngine {
  private folderMapper = new FolderMapper();
  private scriptAssembler = new ScriptAssembler();
  private workspaceBuilder = new WorkspaceBuilder();
  private validator = new AssemblyValidator();

  /**
   * Replay an assembly from its stored blueprint state.
   * Reconstructs the assembly by re-running all assembly stages.
   */
  replayAssembly(
    assemblyId: string,
    version: string,
    blueprint: GameBlueprint,
  ): ReplayResult {
    const trace: ReplayStep[] = [];
    const totalStart = Date.now();

    // ── Load step ────────────────────────────────────────────────────────
    const loadStart = Date.now();
    trace.push({
      stage: "load",
      success: true,
      durationMs: Date.now() - loadStart,
      inputState: { assemblyId, version },
    });

    // ── Map step ─────────────────────────────────────────────────────────
    const mapStart = Date.now();
    let folders;
    try {
      folders = this.folderMapper.mapFolders(blueprint);
      trace.push({
        stage: "map",
        success: true,
        durationMs: Date.now() - mapStart,
        outputState: { folderCount: folders.length },
      });
    } catch (err) {
      trace.push({
        stage: "map",
        success: false,
        durationMs: Date.now() - mapStart,
        error: String(err),
      });
      return this.failResult(
        assemblyId,
        version,
        trace,
        Date.now() - totalStart,
      );
    }

    // ── Assemble step ────────────────────────────────────────────────────
    const assembleStart = Date.now();
    let scripts, modules, ui;
    try {
      const result = this.scriptAssembler.assemble(blueprint);
      scripts = result.scripts;
      modules = result.modules;
      ui = result.ui;
      trace.push({
        stage: "assemble",
        success: true,
        durationMs: Date.now() - assembleStart,
        outputState: {
          scripts: scripts.length,
          modules: modules.length,
          ui: ui.length,
        },
      });
    } catch (err) {
      trace.push({
        stage: "assemble",
        success: false,
        durationMs: Date.now() - assembleStart,
        error: String(err),
      });
      return this.failResult(
        assemblyId,
        version,
        trace,
        Date.now() - totalStart,
      );
    }

    // ── Build step ───────────────────────────────────────────────────────
    const buildStart = Date.now();
    let world, assets, network, configuration;
    try {
      const result = this.workspaceBuilder.build(blueprint);
      world = result.world;
      assets = result.assets;
      network = result.network;
      configuration = result.configuration;
      trace.push({
        stage: "build",
        success: true,
        durationMs: Date.now() - buildStart,
        outputState: {
          world: world.length,
          assets: assets.length,
          network: network.length,
        },
      });
    } catch (err) {
      trace.push({
        stage: "build",
        success: false,
        durationMs: Date.now() - buildStart,
        error: String(err),
      });
      return this.failResult(
        assemblyId,
        version,
        trace,
        Date.now() - totalStart,
      );
    }

    // ── Validate step ────────────────────────────────────────────────────
    const services = [
      ...new Set([
        ...folders.map((f) => f.service),
        ...scripts.map((s) => s.service),
        ...modules.map((m) => m.service),
        ...ui.map((u) => u.service),
      ]),
    ];

    const reconstructed: ProjectAssembly = {
      id: assemblyId,
      generationId: blueprint.id,
      schemaVersion: blueprint.schemaVersion,
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
        buildTimeMs: Date.now() - totalStart,
      },
    };

    const validateStart = Date.now();
    const validation = this.validator.validate(reconstructed);
    reconstructed.validation = validation;
    reconstructed.status =
      validation.status === "failed" ? "failed" : "complete";

    trace.push({
      stage: "validate",
      success: true,
      durationMs: Date.now() - validateStart,
      outputState: { score: validation.score, status: validation.status },
    });

    const totalDurationMs = Date.now() - totalStart;

    console.log(
      `[REPLAY] Complete | Assembly: ${assemblyId} | Version: ${version} | Score: ${validation.score} | Duration: ${totalDurationMs}ms`,
    );

    return {
      assemblyId,
      version,
      reconstructed,
      validation,
      executionTrace: trace,
      totalDurationMs,
      deterministic: true,
    };
  }

  private failResult(
    assemblyId: string,
    version: string,
    trace: ReplayStep[],
    totalDurationMs: number,
  ): ReplayResult {
    return {
      assemblyId,
      version,
      reconstructed: {
        id: assemblyId,
        generationId: "",
        schemaVersion: "1.0.0",
        createdAt: new Date(),
        status: "failed",
        services: [],
        folders: [],
        scripts: [],
        modules: [],
        ui: [],
        world: [],
        assets: [],
        network: [],
        configuration: [],
        build: {
          totalServices: 0,
          totalFolders: 0,
          totalScripts: 0,
          totalModules: 0,
          totalAssets: 0,
          totalNetworkObjects: 0,
          totalWorkspaceEntries: 0,
          totalConfigurations: 0,
          buildTimeMs: totalDurationMs,
        },
      },
      validation: {
        status: "failed",
        score: 0,
        issues: [
          {
            code: "REPLAY_FAILED",
            section: "Replay",
            message: "Replay failed at " + (trace.at(-1)?.stage ?? "unknown"),
            severity: "error",
          },
        ],
        warnings: [],
        errors: ["Replay failed"],
      },
      executionTrace: trace,
      totalDurationMs,
      deterministic: false,
    };
  }
}
