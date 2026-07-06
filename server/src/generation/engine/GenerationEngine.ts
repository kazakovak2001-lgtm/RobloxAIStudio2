/**
 * GenerationEngine.ts
 *
 * Production generation engine that transforms a Blueprint into a complete
 * GenerationModel ready for artifact builders.
 *
 * Orchestrates:
 *   - Generator resolution (dependency order)
 *   - Sequential generator execution
 *   - Model validation
 *   - Session management
 *   - Cache integration
 *   - Event emission
 */

import type { GenerationModel, GameMetadata } from "./GenerationModel";
import { createEmptyModel } from "./GenerationModel";
import { GeneratorRegistry } from "./GeneratorRegistry";
import { GenerationDependencyResolver } from "./GenerationDependencyResolver";
import {
  GenerationModelValidator,
  type ModelValidationResult,
} from "./GenerationModelValidator";
import { GenerationSessionManager } from "./GenerationSessionManager";
import { GenerationCache } from "./GenerationCache";
import {
  createEngineContext,
  type EngineContext,
} from "./GenerationEngineContext";
import type { GeneratorOutput } from "./BaseGenerator";

export interface GenerationEngineConfig {
  cacheEnabled: boolean;
  maxCacheEntries: number;
  validateAfterEachGenerator: boolean;
}

const DEFAULT_ENGINE_CONFIG: GenerationEngineConfig = {
  cacheEnabled: true,
  maxCacheEntries: 200,
  validateAfterEachGenerator: false,
};

export type EngineEventType =
  | "GenerationStarted"
  | "GeneratorStarted"
  | "GeneratorCompleted"
  | "GenerationValidated"
  | "GenerationCompleted"
  | "GenerationFailed";

export interface EngineEvent {
  type: EngineEventType;
  sessionId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export type EngineEventListener = (event: EngineEvent) => void;

export interface GenerationEngineResult {
  success: boolean;
  model: GenerationModel;
  validation: ModelValidationResult;
  context: EngineContext;
  sessionId: string;
  error?: string;
}

export class GenerationEngine {
  private registry: GeneratorRegistry;
  private resolver: GenerationDependencyResolver;
  private validator: GenerationModelValidator;
  private sessions: GenerationSessionManager;
  private cache: GenerationCache;
  private config: GenerationEngineConfig;
  private listeners: EngineEventListener[] = [];

  constructor(
    registry: GeneratorRegistry,
    config?: Partial<GenerationEngineConfig>,
  ) {
    this.registry = registry;
    this.resolver = new GenerationDependencyResolver();
    this.validator = new GenerationModelValidator();
    this.sessions = new GenerationSessionManager();
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.cache = new GenerationCache(this.config.maxCacheEntries);
  }

  /**
   * Generate a complete model from a blueprint.
   */
  async generate(
    blueprint: Record<string, unknown>,
  ): Promise<GenerationEngineResult> {
    const totalStart = Date.now();

    // Extract game metadata from blueprint
    const game = this.extractGameMetadata(blueprint);
    const model = createEmptyModel(game);
    const session = this.sessions.create(model.id);
    const ctx = createEngineContext(session.sessionId, blueprint, model);

    this.emit({
      type: "GenerationStarted",
      sessionId: session.sessionId,
      timestamp: Date.now(),
      data: { modelId: model.id, blueprint: { title: game.title } },
    });

    try {
      // Initialization
      const initStart = Date.now();
      this.initializeModel(model, blueprint);
      ctx.timings.initMs = Date.now() - initStart;

      // Check cache
      const cacheKey = `model:${game.title}:${game.genre}`;
      if (this.config.cacheEnabled) {
        const cached = this.cache.get<GenerationModel>(cacheKey);
        if (cached) {
          ctx.cacheHits++;
          // Use cached model structure as base (generators still run for fresh content)
        } else {
          ctx.cacheMisses++;
        }
      }

      // Resolve generator order
      const generators = this.registry.getAll();
      const resolution = this.resolver.resolve(generators);
      if (!resolution.valid) {
        throw new Error(
          `Circular generator dependencies: ${resolution.cycles.map((c) => c.join(" → ")).join("; ")}`,
        );
      }

      // Execute generators in dependency order
      const genStart = Date.now();
      for (const genId of resolution.order) {
        const generator = this.registry.get(genId);
        if (!generator) continue;

        this.emit({
          type: "GeneratorStarted",
          sessionId: session.sessionId,
          timestamp: Date.now(),
          data: { generatorId: genId },
        });

        const result: GeneratorOutput = await generator.generate({
          blueprint,
          model,
          context: ctx.generatorResults,
        });
        ctx.generatorResults[genId] = {
          success: result.success,
          durationMs: result.durationMs,
          error: result.error,
        };
        this.sessions.recordGenerator(session.sessionId, genId);

        if (!result.success) {
          this.sessions.recordError(
            session.sessionId,
            result.error ?? `Generator "${genId}" failed`,
          );
        }

        this.emit({
          type: "GeneratorCompleted",
          sessionId: session.sessionId,
          timestamp: Date.now(),
          data: {
            generatorId: genId,
            success: result.success,
            durationMs: result.durationMs,
          },
        });
      }
      ctx.timings.generatorsMs = Date.now() - genStart;

      // Validate model
      const valStart = Date.now();
      const validation = this.validator.validate(model);
      ctx.timings.validationMs = Date.now() - valStart;

      this.emit({
        type: "GenerationValidated",
        sessionId: session.sessionId,
        timestamp: Date.now(),
        data: { valid: validation.valid, errors: validation.errors.length },
      });

      // Cache the model
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, model);
      }

      ctx.timings.totalMs = Date.now() - totalStart;
      this.sessions.complete(session.sessionId, validation.valid);

      const eventType: EngineEventType = validation.valid
        ? "GenerationCompleted"
        : "GenerationFailed";
      this.emit({
        type: eventType,
        sessionId: session.sessionId,
        timestamp: Date.now(),
        data: { totalMs: ctx.timings.totalMs, valid: validation.valid },
      });

      return {
        success: validation.valid,
        model,
        validation,
        context: ctx,
        sessionId: session.sessionId,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      ctx.timings.totalMs = Date.now() - totalStart;
      this.sessions.complete(session.sessionId, false);

      this.emit({
        type: "GenerationFailed",
        sessionId: session.sessionId,
        timestamp: Date.now(),
        data: { error },
      });

      return {
        success: false,
        model,
        validation: { valid: false, checks: [], errors: [error], warnings: [] },
        context: ctx,
        sessionId: session.sessionId,
        error,
      };
    }
  }

  /**
   * Subscribe to engine events.
   */
  on(listener: EngineEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Get the generator registry.
   */
  getRegistry(): GeneratorRegistry {
    return this.registry;
  }

  /**
   * Get cache statistics.
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get session manager.
   */
  getSessions(): GenerationSessionManager {
    return this.sessions;
  }

  /**
   * Invalidate cache.
   */
  invalidateCache(): void {
    this.cache.clear();
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private extractGameMetadata(
    blueprint: Record<string, unknown>,
  ): GameMetadata {
    return {
      title:
        (blueprint.name as string) ??
        (blueprint.title as string) ??
        "Untitled Game",
      genre: (blueprint.genre as string) ?? "adventure",
      description: (blueprint.description as string) ?? "",
      targetAudience:
        (blueprint.target_audience as string) ??
        (blueprint.targetAudience as string) ??
        "all",
      mechanics: (blueprint.mechanics as string[]) ?? [],
      maxPlayers:
        (blueprint.estimated_players as number) ??
        (blueprint.maxPlayers as number) ??
        10,
    };
  }

  private initializeModel(
    model: GenerationModel,
    blueprint: Record<string, unknown>,
  ): void {
    // Set up standard Roblox folder structure
    model.folders = [
      {
        path: "ServerScriptService",
        parent: "game",
        purpose: "Server-side scripts",
      },
      {
        path: "StarterPlayerScripts",
        parent: "game",
        purpose: "Client-side scripts",
      },
      { path: "ReplicatedStorage", parent: "game", purpose: "Shared modules" },
      { path: "ServerStorage", parent: "game", purpose: "Server storage" },
      { path: "StarterGui", parent: "game", purpose: "UI screens" },
      { path: "Workspace", parent: "game", purpose: "3D world" },
    ];

    // Set up basic services from blueprint
    model.services = [
      {
        name: "DataStore",
        type: "server",
        description: "Player data persistence",
        dependencies: [],
      },
      {
        name: "Networking",
        type: "shared",
        description: "Client-server communication",
        dependencies: [],
      },
    ];

    // Set configuration from blueprint
    model.configuration.gameSettings = {
      title: model.game.title,
      genre: model.game.genre,
      maxPlayers: model.game.maxPlayers,
    };

    if (blueprint.game_type) {
      model.configuration.gameSettings["gameType"] = blueprint.game_type;
    }
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* non-blocking */
      }
    }
  }
}
