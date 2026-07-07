/**
 * PlatformIntegrationManager.ts — v3.0
 *
 * Single entry point that initializes, coordinates and manages the complete platform lifecycle.
 * Orchestrates: Runtime → Jobs → Generation → Agents → Providers → Memory → Studio → Health
 */

import { AgentRegistry } from "../agents/core/AgentRegistry";
import { JobManager } from "../jobs/JobManager";
import { GenerationCoordinator } from "../generation/coordinator/GenerationCoordinator";
import { GenerationEngine } from "../generation/engine/GenerationEngine";
import { GeneratorRegistry } from "../generation/engine/GeneratorRegistry";
import { LuaGenerationEngine } from "../lua/LuaGenerationEngine";
import { AssetGenerationEngine } from "../assets/AssetGenerationEngine";
import { UIGenerationEngine } from "../ui-gen/UIGenerationEngine";
import { AgentOrchestrator } from "../agents/orchestrator/AgentOrchestrator";
import { CapabilityRegistry } from "../agents/orchestrator/CapabilityRegistry";
import { ProviderFactory } from "../providers/ai/ProviderFactory";
import { ProviderRegistry } from "../providers/ai/ProviderRegistry";
import { ProviderHealthService } from "../providers/ai/ProviderHealthService";
import { ProviderFallbackManager } from "../providers/ai/RetryPolicy";
import { KnowledgeMemoryManager } from "../memory/knowledge/MemoryManager";
import { KnowledgeRepository } from "../memory/knowledge/KnowledgeRepository";
import { ArtifactIndex } from "../memory/knowledge/ArtifactIndex";
import { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";

export type PlatformStatus =
  "stopped" | "starting" | "running" | "degraded" | "stopping";

export interface PlatformComponents {
  agentRegistry: AgentRegistry;
  jobManager: JobManager;
  generationCoordinator: GenerationCoordinator;
  generationEngine: GenerationEngine;
  luaEngine: LuaGenerationEngine;
  assetEngine: AssetGenerationEngine;
  uiEngine: UIGenerationEngine;
  orchestrator: AgentOrchestrator;
  providerRegistry: ProviderRegistry;
  providerHealth: ProviderHealthService;
  providerFallback: ProviderFallbackManager;
  memoryManager: KnowledgeMemoryManager;
  knowledgeRepo: KnowledgeRepository;
  artifactIndex: ArtifactIndex;
  studioManager: StudioIntegrationManager;
}

export interface PlatformHealthReport {
  status: PlatformStatus;
  components: Record<
    string,
    { status: "healthy" | "degraded" | "unavailable"; detail?: string }
  >;
  uptime: number;
  timestamp: number;
}

export class PlatformIntegrationManager {
  private status: PlatformStatus = "stopped";
  private components: PlatformComponents | null = null;
  private startedAt = 0;

  /**
   * Initialize and start all platform subsystems.
   */
  start(): PlatformComponents {
    this.status = "starting";

    // Core
    const agentRegistry = new AgentRegistry();
    const generatorRegistry = new GeneratorRegistry();
    const capabilityRegistry = new CapabilityRegistry();

    // Providers
    const providerRegistry = ProviderFactory.createDefault();
    const providerHealth = new ProviderHealthService(providerRegistry);
    const providerFallback = new ProviderFallbackManager(
      providerRegistry,
      providerHealth,
    );

    // Memory
    const memoryManager = new KnowledgeMemoryManager();
    const knowledgeRepo = new KnowledgeRepository();
    const artifactIndex = new ArtifactIndex();

    // Engines
    const generationEngine = new GenerationEngine(generatorRegistry);
    const luaEngine = new LuaGenerationEngine();
    const assetEngine = new AssetGenerationEngine();
    const uiEngine = new UIGenerationEngine();

    // Orchestration
    const orchestrator = new AgentOrchestrator(capabilityRegistry);

    // Pipeline
    const generationCoordinator = new GenerationCoordinator(agentRegistry);

    // Jobs
    const jobManager = new JobManager(agentRegistry);
    jobManager.start();

    // Studio
    const studioManager = new StudioIntegrationManager();

    this.components = {
      agentRegistry,
      jobManager,
      generationCoordinator,
      generationEngine,
      luaEngine,
      assetEngine,
      uiEngine,
      orchestrator,
      providerRegistry,
      providerHealth,
      providerFallback,
      memoryManager,
      knowledgeRepo,
      artifactIndex,
      studioManager,
    };

    this.status = "running";
    this.startedAt = Date.now();
    return this.components;
  }

  /**
   * Graceful shutdown.
   */
  stop(): void {
    this.status = "stopping";
    if (this.components) {
      this.components.jobManager.stop();
    }
    this.status = "stopped";
  }

  /**
   * Get platform health report.
   */
  getHealth(): PlatformHealthReport {
    const components: PlatformHealthReport["components"] = {};

    if (!this.components) {
      return {
        status: "stopped",
        components: {},
        uptime: 0,
        timestamp: Date.now(),
      };
    }

    components["runtime"] = { status: "healthy" };
    components["jobEngine"] = {
      status: "healthy",
      detail: `Queue: ${this.components.jobManager.getQueueStatus().queued}`,
    };
    components["generationEngine"] = { status: "healthy" };
    components["luaEngine"] = { status: "healthy" };
    components["assetEngine"] = { status: "healthy" };
    components["uiEngine"] = { status: "healthy" };
    components["orchestrator"] = { status: "healthy" };
    components["providers"] = {
      status:
        this.components.providerRegistry.getAvailable().length > 0
          ? "healthy"
          : "degraded",
      detail: `${this.components.providerRegistry.getAvailable().length} available`,
    };
    components["memory"] = {
      status: "healthy",
      detail: `${this.components.memoryManager.entryCount} entries`,
    };
    components["studio"] = {
      status: "healthy",
      detail: `${this.components.studioManager.getConnectionCount()} connections`,
    };

    const allHealthy = Object.values(components).every(
      (c) => c.status === "healthy",
    );

    return {
      status: allHealthy ? "running" : "degraded",
      components,
      uptime: Date.now() - this.startedAt,
      timestamp: Date.now(),
    };
  }

  getStatus(): PlatformStatus {
    return this.status;
  }
  getComponents(): PlatformComponents | null {
    return this.components;
  }
}
