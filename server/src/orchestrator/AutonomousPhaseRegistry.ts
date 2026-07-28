import { AgentCoordinator } from "../agents/collaboration/AgentCoordinator";
import type { AgentTask } from "../agents/collaboration/CollaborationTypes";
import { BenchmarkEngine } from "../domain/BenchmarkEngine";
import { GenreLibrary } from "../domain/GenreLibrary";
import type {
  BenchmarkResult,
  GameGenre,
} from "../domain/DomainTypes";
import { AssetGenerationEngine } from "../generation/assets/AssetGenerationEngine";
import type { AssetGenerationResult } from "../generation/assets/AssetTypes";
import { GameBlueprintEngine } from "../generation/blueprint/GameBlueprintEngine";
import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";
import { ExperienceAssembler } from "../generation/experience/ExperienceAssembler";
import type { AssemblyResult } from "../generation/experience/ExperienceAssembler";
import { LuaGenerationEngine } from "../generation/lua/LuaGenerationEngine";
import type {
  GameplaySystem,
  LuaGenerationResult,
} from "../generation/lua/LuaGenerationTypes";
import { KnowledgeEngine } from "../knowledge/KnowledgeEngine";
import { PlaytestEngine } from "../playtest/PlaytestEngine";
import type { PlaytestReport } from "../playtest/PlaytestTypes";
import type {
  EvidenceLevel,
  OrchestratorPhase,
} from "./OrchestratorTypes";

export type RunnableOrchestratorPhase = Exclude<
  OrchestratorPhase,
  | "completed"
  | "preview_completed"
  | "simulated"
  | "failed"
  | "paused"
  | "cancelled"
>;

export type PhaseCapabilityStatus = "available" | "degraded" | "unavailable";

export interface PhaseCapability {
  status: PhaseCapabilityStatus;
  evidence: EvidenceLevel;
  service: string;
  reason?: string;
  cancellable: boolean;
  checkpointable: boolean;
}

export interface AutonomousPhaseContext {
  projectId: string;
  prompt: string;
  genre?: string;
  systems: string[];
  knowledge?: Record<string, unknown>;
  blueprint?: RobloxGameBlueprint;
  collaborationTasks?: AgentTask[];
  lua?: LuaGenerationResult;
  assets?: AssetGenerationResult;
  assembly?: AssemblyResult;
  playtest?: PlaytestReport;
  benchmark?: BenchmarkResult;
}

export interface PhaseExecutionResult {
  status: "completed" | "skipped";
  evidence: EvidenceLevel;
  service: string;
  output: Record<string, unknown>;
  context: AutonomousPhaseContext;
  qualityScore?: number;
  reason?: string;
}

export interface AutonomousPhaseAdapter {
  readonly phase: RunnableOrchestratorPhase;
  capability(context: AutonomousPhaseContext): PhaseCapability;
  execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult>;
}

function ensureNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Autonomous phase cancelled", "AbortError");
  }
}

function normalizeGenre(value?: string): GameGenre {
  const known: GameGenre[] = [
    "obby",
    "simulator",
    "tycoon",
    "rpg",
    "fps",
    "tower_defense",
    "survival",
    "horror",
    "adventure",
    "idle",
    "pet_simulator",
    "battle_arena",
  ];
  return known.includes(value as GameGenre)
    ? (value as GameGenre)
    : "adventure";
}

function detectGenre(prompt: string): GameGenre {
  const lower = prompt.toLowerCase();
  if (lower.includes("rpg")) return "rpg";
  if (lower.includes("obby")) return "obby";
  if (lower.includes("pet simulator")) return "pet_simulator";
  if (lower.includes("simulator")) return "simulator";
  if (lower.includes("tycoon")) return "tycoon";
  if (lower.includes("fps") || lower.includes("shooter")) return "fps";
  if (lower.includes("tower defense")) return "tower_defense";
  if (lower.includes("battle arena")) return "battle_arena";
  if (lower.includes("survival")) return "survival";
  if (lower.includes("horror")) return "horror";
  if (lower.includes("idle") || lower.includes("clicker")) return "idle";
  return "adventure";
}

function toGameplaySystems(systems: string[]): GameplaySystem[] {
  const supported = new Set<GameplaySystem>([
    "gameplay",
    "combat",
    "inventory",
    "npc",
    "dialogue",
    "quest",
    "economy",
    "lobby",
    "datastore",
    "ui",
    "player",
    "config",
    "remotes",
  ]);
  const mapped = systems
    .map((system) => {
      const normalized = system.toLowerCase();
      if (normalized === "quests") return "quest";
      if (normalized === "npcs") return "npc";
      if (normalized === "currency") return "economy";
      if (normalized === "matchmaking") return "lobby";
      if (normalized === "progression") return "player";
      return normalized;
    })
    .filter((system): system is GameplaySystem =>
      supported.has(system as GameplaySystem),
    );
  return mapped.length > 0 ? [...new Set(mapped)] : ["gameplay"];
}

abstract class BaseAdapter implements AutonomousPhaseAdapter {
  abstract readonly phase: RunnableOrchestratorPhase;
  abstract capability(context: AutonomousPhaseContext): PhaseCapability;
  abstract execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult>;

  protected completed(
    context: AutonomousPhaseContext,
    service: string,
    evidence: EvidenceLevel,
    output: Record<string, unknown>,
    qualityScore?: number,
  ): PhaseExecutionResult {
    return {
      status: "completed",
      service,
      evidence,
      output,
      context,
      qualityScore,
    };
  }

  protected skipped(
    context: AutonomousPhaseContext,
    capability: PhaseCapability,
  ): PhaseExecutionResult {
    return {
      status: "skipped",
      service: capability.service,
      evidence: capability.evidence,
      output: {
        capability: capability.status,
        service: capability.service,
        reason: capability.reason,
      },
      context,
      reason: capability.reason,
    };
  }
}

class GenreDetectionAdapter extends BaseAdapter {
  readonly phase = "genre_detection" as const;

  capability(): PhaseCapability {
    return {
      status: "degraded",
      evidence: "heuristic",
      service: "PromptGenreHeuristic",
      reason: "Keyword classification is deterministic but not model-verified.",
      cancellable: true,
      checkpointable: true,
    };
  }

  async execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    ensureNotAborted(signal);
    const genre = detectGenre(context.prompt);
    const library = new GenreLibrary();
    const reference = library.get(genre);
    context.genre = genre;
    context.systems = reference?.requiredSystems ?? ["gameplay"];
    return this.completed(context, "PromptGenreHeuristic", "heuristic", {
      genre,
      requiredSystems: context.systems,
      confidenceBasis: "keyword-rules",
    });
  }
}

class KnowledgeSearchAdapter extends BaseAdapter {
  readonly phase = "knowledge_search" as const;
  private readonly knowledge = new KnowledgeEngine();

  capability(): PhaseCapability {
    return {
      status: "available",
      evidence: "heuristic",
      service: "KnowledgeEngine",
      cancellable: true,
      checkpointable: true,
    };
  }

  async execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    ensureNotAborted(signal);
    const recommendations = this.knowledge.getRecommendations(
      context.genre ?? "adventure",
      context.systems,
    );
    context.knowledge = recommendations as unknown as Record<string, unknown>;
    return this.completed(context, "KnowledgeEngine", "heuristic", {
      similarProjects: recommendations.similarProjects.length,
      recommendedPatterns: recommendations.recommendedPatterns.length,
      bestPrompts: recommendations.bestPrompts.length,
    });
  }
}

class BlueprintAdapter extends BaseAdapter {
  readonly phase = "blueprint" as const;
  private readonly engine = new GameBlueprintEngine();

  capability(): PhaseCapability {
    return {
      status: "available",
      evidence: "heuristic",
      service: "GameBlueprintEngine",
      cancellable: true,
      checkpointable: true,
    };
  }

  async execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    ensureNotAborted(signal);
    const blueprint = this.engine.generate({
      goal: context.prompt,
      blueprint: {
        name: context.prompt.slice(0, 80),
        game_type: context.genre ?? "adventure",
        description: context.prompt,
      },
      gameplay: {
        mechanics: context.systems,
        loop: "discover → engage → reward → repeat",
      },
    });
    context.blueprint = blueprint;
    return this.completed(context, "GameBlueprintEngine", "heuristic", {
      blueprintId: blueprint.id,
      title: blueprint.title,
      genre: blueprint.genre,
      mechanics: blueprint.mechanics,
    });
  }
}

class CollaborationAdapter extends BaseAdapter {
  readonly phase = "agent_collaboration" as const;

  capability(): PhaseCapability {
    return {
      status: "degraded",
      evidence: "heuristic",
      service: "AgentCoordinator",
      reason:
        "The bounded coordinator creates assigned tasks but does not execute AI agents.",
      cancellable: true,
      checkpointable: true,
    };
  }

  async execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    ensureNotAborted(signal);
    const coordinator = new AgentCoordinator();
    const tasks = coordinator.runCollaborativeSession(
      {
        agentId: "autonomous-preview",
        role: "gameplay",
        projectId: context.projectId,
        blueprint: (context.blueprint ?? {}) as unknown as Record<
          string,
          unknown
        >,
        knowledge: context.knowledge ?? {},
        repairHistory: [],
        playtestReport: null,
        experienceManifest: null,
      },
      context.systems,
    );
    context.collaborationTasks = tasks;
    return this.completed(context, "AgentCoordinator", "heuristic", {
      taskCount: tasks.length,
      assignedRoles: [...new Set(tasks.map((task) => task.assignee))],
      executedTaskCount: 0,
    });
  }
}

class LuaGenerationAdapter extends BaseAdapter {
  readonly phase = "lua_generation" as const;

  capability(): PhaseCapability {
    return {
      status: "available",
      evidence: "verified",
      service: "generation/lua/LuaGenerationEngine",
      cancellable: true,
      checkpointable: true,
    };
  }

  async execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    ensureNotAborted(signal);
    const result = new LuaGenerationEngine().generate({
      projectId: context.projectId,
      gameName: context.blueprint?.title ?? context.prompt.slice(0, 80),
      genre: context.genre ?? "adventure",
      systems: toGameplaySystems(context.systems),
      features: context.blueprint?.mechanics,
    });
    ensureNotAborted(signal);
    context.lua = result;
    return this.completed(
      context,
      "generation/lua/LuaGenerationEngine",
      "verified",
      {
        totalScripts: result.totalScripts,
        totalSizeBytes: result.totalSizeBytes,
        validationPassed: result.validationPassed,
        generationTimeMs: result.generationTimeMs,
      },
    );
  }
}

class AssetGenerationAdapter extends BaseAdapter {
  readonly phase = "asset_generation" as const;

  capability(): PhaseCapability {
    return {
      status: "degraded",
      evidence: "heuristic",
      service: "generation/assets/AssetGenerationEngine",
      reason:
        "The engine produces validated asset definitions and placeholders, not native uploaded Roblox assets.",
      cancellable: true,
      checkpointable: true,
    };
  }

  async execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    ensureNotAborted(signal);
    const genre = normalizeGenre(context.genre);
    const reference = new GenreLibrary().get(genre);
    const result = new AssetGenerationEngine().generate({
      projectId: context.projectId,
      gameName: context.blueprint?.title ?? context.prompt.slice(0, 80),
      genre,
      systems: context.systems,
      uiScreens: reference?.expectedUI,
    });
    ensureNotAborted(signal);
    context.assets = result;
    return this.completed(
      context,
      "generation/assets/AssetGenerationEngine",
      "heuristic",
      {
        totalAssets: result.manifest.totalAssets,
        generatedCount: result.manifest.generatedCount,
        placeholderCount: result.manifest.placeholderCount,
        validationScore: result.validation.score,
        valid: result.validation.valid,
      },
    );
  }
}

class ExperienceAssemblyAdapter extends BaseAdapter {
  readonly phase = "experience_assembly" as const;

  capability(context: AutonomousPhaseContext): PhaseCapability {
    return context.lua
      ? {
          status: "available",
          evidence: "verified",
          service: "generation/experience/ExperienceAssembler",
          cancellable: true,
          checkpointable: true,
        }
      : {
          status: "unavailable",
          evidence: "synthetic",
          service: "generation/experience/ExperienceAssembler",
          reason: "Lua generation output is required before assembly.",
          cancellable: true,
          checkpointable: true,
        };
  }

  async execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    const capability = this.capability(context);
    if (!context.lua) return this.skipped(context, capability);
    ensureNotAborted(signal);
    const result = new ExperienceAssembler().assemble(context.lua);
    ensureNotAborted(signal);
    context.assembly = result;
    return this.completed(
      context,
      "generation/experience/ExperienceAssembler",
      "verified",
      {
        success: result.success,
        totalScripts: result.manifest.totalScripts,
        validationScore: result.manifest.validationScore,
        dependencyNodes: result.manifest.dependencyGraph.nodes.length,
        dependencyCycles: result.manifest.dependencyGraph.circular.length,
      },
    );
  }
}

class PlaytestAdapter extends BaseAdapter {
  readonly phase = "playtest" as const;

  capability(context: AutonomousPhaseContext): PhaseCapability {
    return context.lua && context.assets
      ? {
          status: "degraded",
          evidence: "heuristic",
          service: "PlaytestEngine",
          reason:
            "PlaytestEngine performs deterministic static analysis, not a Roblox runtime play session.",
          cancellable: true,
          checkpointable: true,
        }
      : {
          status: "unavailable",
          evidence: "synthetic",
          service: "PlaytestEngine",
          reason: "Lua and asset outputs are required before static playtest.",
          cancellable: true,
          checkpointable: true,
        };
  }

  async execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    const capability = this.capability(context);
    if (!context.lua || !context.assets) return this.skipped(context, capability);
    ensureNotAborted(signal);
    const report = new PlaytestEngine().run({
      projectId: context.projectId,
      scripts: context.lua.artifacts.map((artifact) => ({
        name: artifact.name,
        type: artifact.scriptType,
        path: artifact.path,
        content: artifact.content,
        dependencies: artifact.dependencies,
      })),
      assets: context.assets.manifest.assets.map((asset) => ({
        name: asset.name,
        type: asset.type,
        targetService: asset.targetService,
        placeholder: asset.placeholder,
      })),
      dependencyGraph: context.assembly
        ? {
            nodes: context.assembly.manifest.dependencyGraph.nodes,
            edges: context.assembly.manifest.dependencyGraph.edges.map(
              ({ from, to }) => ({ from, to }),
            ),
            circular: context.assembly.manifest.dependencyGraph.circular,
          }
        : undefined,
    });
    ensureNotAborted(signal);
    context.playtest = report;
    return this.completed(
      context,
      "PlaytestEngine",
      "heuristic",
      {
        overallScore: report.overallScore,
        classification: report.classification,
        issueCount: report.issues.length,
        estimatedInitTimeMs: report.performance.estimatedInitTimeMs,
        runtimeExecuted: false,
      },
      report.overallScore,
    );
  }
}

class RepairAdapter extends BaseAdapter {
  readonly phase = "repair" as const;

  capability(): PhaseCapability {
    return {
      status: "unavailable",
      evidence: "synthetic",
      service: "RepairEngine",
      reason:
        "RepairEngine currently simulates score improvement and cost instead of modifying and revalidating artifacts.",
      cancellable: true,
      checkpointable: true,
    };
  }

  async execute(
    context: AutonomousPhaseContext,
    _signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    return this.skipped(context, this.capability(context));
  }
}

class BenchmarkAdapter extends BaseAdapter {
  readonly phase = "benchmark" as const;

  capability(): PhaseCapability {
    return {
      status: "degraded",
      evidence: "heuristic",
      service: "BenchmarkEngine",
      reason: "Benchmarking compares static structure against genre references.",
      cancellable: true,
      checkpointable: true,
    };
  }

  async execute(
    context: AutonomousPhaseContext,
    signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    ensureNotAborted(signal);
    const engine = new BenchmarkEngine(new GenreLibrary());
    const result = engine.analyze({
      genre: normalizeGenre(context.genre),
      systems: context.systems,
      scriptCount: context.lua?.totalScripts ?? 0,
      assetCount: context.assets?.manifest.totalAssets ?? 0,
      hasMultiplayer: context.systems.some((system) =>
        ["matchmaking", "lobby", "teams", "coop"].includes(system),
      ),
    });
    context.benchmark = result;
    return this.completed(
      context,
      "BenchmarkEngine",
      "heuristic",
      {
        overallScore: result.overallScore,
        completeness: result.completeness,
        scalability: result.scalability,
        maintainability: result.maintainability,
        missingRequired: result.missingRequired,
      },
    );
  }
}

class StudioSyncAdapter extends BaseAdapter {
  readonly phase = "studio_sync" as const;

  capability(): PhaseCapability {
    return {
      status: "unavailable",
      evidence: "synthetic",
      service: "StudioBridgeServer",
      reason:
        "No authenticated Studio session and exact artifact verification context is attached to this autonomous run.",
      cancellable: true,
      checkpointable: true,
    };
  }

  async execute(
    context: AutonomousPhaseContext,
    _signal: AbortSignal,
  ): Promise<PhaseExecutionResult> {
    return this.skipped(context, this.capability(context));
  }
}

export class AutonomousPhaseRegistry {
  private readonly adapters = new Map<
    RunnableOrchestratorPhase,
    AutonomousPhaseAdapter
  >();

  constructor(adapters: AutonomousPhaseAdapter[] = createDefaultAdapters()) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.phase)) {
        throw new Error(`Duplicate autonomous phase adapter: ${adapter.phase}`);
      }
      this.adapters.set(adapter.phase, adapter);
    }
  }

  get(phase: RunnableOrchestratorPhase): AutonomousPhaseAdapter | undefined {
    return this.adapters.get(phase);
  }

  listCapabilities(
    context: AutonomousPhaseContext,
  ): Record<RunnableOrchestratorPhase, PhaseCapability> {
    return Object.fromEntries(
      [...this.adapters.entries()].map(([phase, adapter]) => [
        phase,
        adapter.capability(context),
      ]),
    ) as Record<RunnableOrchestratorPhase, PhaseCapability>;
  }
}

function createDefaultAdapters(): AutonomousPhaseAdapter[] {
  return [
    new GenreDetectionAdapter(),
    new KnowledgeSearchAdapter(),
    new BlueprintAdapter(),
    new CollaborationAdapter(),
    new LuaGenerationAdapter(),
    new AssetGenerationAdapter(),
    new ExperienceAssemblyAdapter(),
    new PlaytestAdapter(),
    new RepairAdapter(),
    new BenchmarkAdapter(),
    new StudioSyncAdapter(),
  ];
}

export function createAutonomousPhaseContext(
  projectId: string,
  prompt: string,
): AutonomousPhaseContext {
  return {
    projectId,
    prompt,
    systems: [],
  };
}
