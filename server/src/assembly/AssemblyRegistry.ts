import type { ProjectAssembly, AssemblyManifest } from "./AssemblyTypes";
import { AssemblyPersistenceStore } from "./AssemblyPersistenceStore";
import {
  AssemblyHistoryIndex,
  type HistoryEntry,
} from "./AssemblyHistoryIndex";
import type { VersionEntry } from "./AssemblyVersioning";
import {
  AssemblyReplayEngine,
  type ReplayResult,
} from "./AssemblyReplayEngine";
import { AssemblyDiffEngine, type AssemblyDiff } from "./AssemblyDiffEngine";
import { AssemblyChangeGraphBuilder } from "./AssemblyChangeGraph";
import {
  AssemblyImpactAnalyzer,
  type ImpactAnalysis,
} from "./AssemblyImpactAnalyzer";
import type { GameBlueprint } from "../generation/GenerationBlueprint";

/**
 * AssemblyRegistry
 *
 * In-memory cache + persistence gateway + replay/diff support.
 * Automatically persists assemblies to disk on store/update.
 * Loads from disk on cache miss.
 * Provides cached replay and diff operations.
 */
export class AssemblyRegistry {
  private cache = new Map<string, ProjectAssembly>();
  private manifests = new Map<string, AssemblyManifest>();
  private replayCache = new Map<string, ReplayResult>();
  private diffCache = new Map<string, AssemblyDiff>();
  private impactCache = new Map<string, ImpactAnalysis>();
  private persistence: AssemblyPersistenceStore;
  private history: AssemblyHistoryIndex;
  private replayEngine = new AssemblyReplayEngine();
  private diffEngine = new AssemblyDiffEngine();
  private changeGraphBuilder = new AssemblyChangeGraphBuilder();
  private impactAnalyzer = new AssemblyImpactAnalyzer();

  constructor(storageRoot?: string) {
    this.persistence = new AssemblyPersistenceStore(storageRoot);
    this.history = new AssemblyHistoryIndex(storageRoot);
  }

  /**
   * Store assembly in cache and persist to disk.
   */
  store(assembly: ProjectAssembly): VersionEntry {
    this.cache.set(assembly.id, assembly);
    if (assembly.manifest) {
      this.manifests.set(assembly.id, assembly.manifest);
    }
    const versionEntry = this.persistence.save(assembly);
    this.history.append({
      assemblyId: assembly.id,
      generationId: assembly.generationId,
      version: versionEntry.version,
      status: assembly.status,
      timestamp: new Date().toISOString(),
      validationScore: assembly.validation?.score,
    });
    return versionEntry;
  }

  /**
   * Get assembly by ID. Checks cache first, then disk.
   */
  get(id: string): ProjectAssembly | null {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const entry = this.persistence.loadLatest(id);
    if (entry) {
      this.cache.set(id, entry.snapshot);
      return entry.snapshot;
    }
    return null;
  }

  /**
   * Get a specific version of an assembly.
   */
  getVersion(id: string, version: string): ProjectAssembly | null {
    const entry = this.persistence.loadVersion(id, version);
    return entry?.snapshot ?? null;
  }

  getManifest(id: string): AssemblyManifest | null {
    return this.manifests.get(id) ?? null;
  }

  listVersions(id: string): string[] {
    return this.persistence.listVersions(id);
  }

  has(id: string): boolean {
    return this.cache.has(id) || this.persistence.exists(id);
  }

  listIds(): string[] {
    return this.persistence.listAll();
  }

  getHistory(): AssemblyHistoryIndex {
    return this.history;
  }

  latestSuccessful(id: string): HistoryEntry | null {
    return this.history.latestSuccessful(id);
  }

  // ─── Replay ────────────────────────────────────────────────────────────────

  /**
   * Replay an assembly version. Returns cached result if available.
   */
  getReplay(
    assemblyId: string,
    version: string,
    blueprint: GameBlueprint,
  ): ReplayResult {
    const cacheKey = `${assemblyId}::${version}`;
    const cached = this.replayCache.get(cacheKey);
    if (cached) return cached;

    const result = this.replayEngine.replayAssembly(
      assemblyId,
      version,
      blueprint,
    );
    this.replayCache.set(cacheKey, result);
    return result;
  }

  // ─── Diff ──────────────────────────────────────────────────────────────────

  /**
   * Compute structural diff between two assembly versions. Returns cached result if available.
   */
  getDiff(
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): AssemblyDiff | null {
    const cacheKey = `${assemblyId}::${fromVersion}::${toVersion}`;
    const cached = this.diffCache.get(cacheKey);
    if (cached) return cached;

    const baseEntry = this.persistence.loadVersion(assemblyId, fromVersion);
    const targetEntry = this.persistence.loadVersion(assemblyId, toVersion);
    if (!baseEntry || !targetEntry) return null;

    const diff = this.diffEngine.diffAssemblies(
      baseEntry.snapshot,
      targetEntry.snapshot,
      fromVersion,
      toVersion,
    );
    this.diffCache.set(cacheKey, diff);
    return diff;
  }

  // ─── Impact Analysis ────────────────────────────────────────────────────────

  /**
   * Compute impact analysis between two versions. Cached.
   */
  getImpactAnalysis(
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): ImpactAnalysis | null {
    const cacheKey = `impact::${assemblyId}::${fromVersion}::${toVersion}`;
    const cached = this.impactCache.get(cacheKey);
    if (cached) return cached;

    const diff = this.getDiff(assemblyId, fromVersion, toVersion);
    if (!diff) return null;

    const graph = this.changeGraphBuilder.buildChangeGraph(diff);
    const analysis = this.impactAnalyzer.analyzeImpact(diff, graph);
    this.impactCache.set(cacheKey, analysis);
    return analysis;
  }

  // ─── Governance ────────────────────────────────────────────────────────────

  /**
   * Run governance check between two versions.
   * Returns the GovernanceDecision (ALLOW/WARN/BLOCK).
   */
  runGovernanceCheck(
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): import("../governance/GovernancePolicyEngine").GovernanceDecision | null {
    const analysis = this.getImpactAnalysis(assemblyId, fromVersion, toVersion);
    if (!analysis) return null;
    const { GovernancePolicyEngine } =
      require("../governance/GovernancePolicyEngine") as typeof import("../governance/GovernancePolicyEngine");
    const engine = new GovernancePolicyEngine();
    return engine.evaluatePolicies(analysis);
  }

  /**
   * Get the CI status for the latest build of an assembly.
   * Returns "PASSED", "BLOCKED", or null if no versions to compare.
   */
  getCIStatus(assemblyId: string): "PASSED" | "BLOCKED" | "WARN" | null {
    const versions = this.listVersions(assemblyId);
    if (versions.length < 2) return "PASSED"; // first build always passes
    const from = versions[versions.length - 2];
    const to = versions[versions.length - 1];
    const decision = this.runGovernanceCheck(assemblyId, from, to);
    if (!decision) return null;
    if (decision.status === "BLOCK") return "BLOCKED";
    if (decision.status === "WARN") return "WARN";
    return "PASSED";
  }

  get size(): number {
    return Math.max(this.cache.size, this.persistence.listAll().length);
  }
}

let _default: AssemblyRegistry | null = null;
export function getDefaultAssemblyRegistry(): AssemblyRegistry {
  if (!_default) _default = new AssemblyRegistry();
  return _default;
}
