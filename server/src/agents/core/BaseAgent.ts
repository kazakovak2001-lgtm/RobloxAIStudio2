import {
  createDefaultPromptTemplateRegistry,
  type PromptTemplateRegistry,
} from "../../ai/promptTemplates";
import { createDefaultPromptEngine, type PromptEngine } from "../../ai/prompts";

export interface AgentConfig {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  maxRetries?: number;
  timeout?: number;
}

export interface AgentInput {
  [key: string]: unknown;
}

export interface AgentOutput {
  [key: string]: unknown;
}

export interface AgentResult<T = AgentOutput> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  duration: number;
  timestamp: Date;
  /**
   * True when no LLM was available to this agent, so its output is
   * deterministic fallback content rather than model output. Callers must
   * never present such output as an AI generation.
   */
  usedFallback?: boolean;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/** Shared registry instance — one per process, lazily initialised. */
let _sharedRegistry: PromptTemplateRegistry | null = null;
function getSharedRegistry(): PromptTemplateRegistry {
  if (!_sharedRegistry) {
    _sharedRegistry = createDefaultPromptTemplateRegistry();
  }
  return _sharedRegistry;
}

/** Shared PromptEngine — production prompt source. */
let _sharedEngine: PromptEngine | null = null;
function getSharedEngine(): PromptEngine {
  if (!_sharedEngine) {
    _sharedEngine = createDefaultPromptEngine();
  }
  return _sharedEngine;
}

export abstract class BaseAgent {
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly inputSchema: Record<string, unknown>;
  public abstract readonly outputSchema: Record<string, unknown>;

  protected maxRetries = 3;
  protected timeout = 30000;
  protected llm?: {
    generate(prompt: string, options?: LLMOptions): Promise<string>;
  };

  /** Per-agent override; falls back to shared default registry. */
  private _templateRegistry?: PromptTemplateRegistry;

  /**
   * Set when this run produced deterministic fallback content instead of
   * model output. Reset at the start of every execute() attempt so it always
   * describes the run being reported.
   *
   * Every concrete agent guards its own LLM call with `if (!this.llm) return
   * fallback` before reaching generateWithRetry, so execute() also derives
   * this from the absence of a provider. That is deliberately conservative:
   * it can over-report fallback, never under-report it.
   */
  private _usedFallback = false;

  constructor(config?: Partial<AgentConfig>) {
    if (config?.maxRetries) this.maxRetries = config.maxRetries;
    if (config?.timeout) this.timeout = config.timeout;
  }

  /**
   * Wire an LLM provider into this agent.
   * Called by AgentRegistry after all agents are instantiated.
   */
  setLLM(llm: {
    generate(prompt: string, options?: LLMOptions): Promise<string>;
  }): void {
    this.llm = llm;
  }

  /**
   * Override the prompt template registry for this agent.
   * If not set, uses the shared default registry.
   */
  setTemplateRegistry(registry: PromptTemplateRegistry): void {
    this._templateRegistry = registry;
  }

  /**
   * Render a prompt from the registry for this agent's type.
   * Agents call this instead of building prompts inline.
   *
   * @param vars   Variable map for {{key}} substitution
   * @param part   "user" (default) or "system"
   * @returns rendered string, or null if no template is registered
   */
  protected renderPrompt(
    vars: Record<string, string>,
    part: "user" | "system" = "user",
  ): string | null {
    const registry = this._templateRegistry ?? getSharedRegistry();
    const agentType = this.agentTypeKey();
    if (!agentType) return null;
    return part === "system"
      ? registry.renderSystem(agentType, vars)
      : registry.render(agentType, vars);
  }

  /**
   * Build a full prompt by combining system + user sections.
   * Priority: PromptEngine (versioned) → PromptTemplateRegistry (legacy) → null
   */
  protected buildPrompt(vars: Record<string, string>): string | null {
    // 1. Try PromptEngine (production source with versioning + validation)
    const agentType = this.agentTypeKey();
    if (agentType) {
      const engine = getSharedEngine();
      const result = engine.render(agentType, vars);
      if (result.success) {
        return [result.system, result.prompt].filter(Boolean).join("\n\n");
      }
    }

    // 2. Fallback to legacy PromptTemplateRegistry
    const system = this.renderPrompt(vars, "system");
    const user = this.renderPrompt(vars, "user");
    if (!system && !user) return null;
    return [system, user].filter(Boolean).join("\n\n");
  }

  /**
   * Map this agent's display name to its registry key.
   * Override in subclasses if the registry key differs from the name.
   */
  protected agentTypeKey(): string | null {
    const map: Record<string, string> = {
      Requirements: "requirements",
      Planner: "planner",
      GameDesigner: "game_designer",
      RobloxArchitect: "roblox_architect",
      LuaGenerator: "lua_generator",
      UIGenerator: "ui_generator",
      AssetPlanner: "asset_planner",
      Orchestrator: "orchestrator",
      Database: "database",
      Documentation: "documentation",
      Tester: "tester",
      Debug: "debug",
      Performance: "performance",
    };
    return map[this.name] ?? null;
  }

  async execute(input: AgentInput): Promise<AgentResult<AgentOutput>> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.maxRetries) {
      attempts++;
      this._usedFallback = false;
      try {
        const data = await this.process(input);
        const usedFallback = this._usedFallback || !this.llm;
        return {
          success: true,
          data: data as AgentOutput,
          attempts,
          duration: Date.now() - startTime,
          timestamp: new Date(),
          ...(usedFallback ? { usedFallback: true } : {}),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempts < this.maxRetries) {
          await this.delay(1000 * attempts);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || "Unknown error",
      attempts,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  async retry(
    input: AgentInput,
    _error?: string,
  ): Promise<AgentResult<AgentOutput>> {
    return this.execute(input);
  }

  protected abstract process(
    input: AgentInput,
  ): Promise<Record<string, unknown>>;

  /**
   * Call the LLM with automatic retry on invalid/incomplete JSON output.
   *
   * Execution contract (per task spec):
   *   1. First call with the original prompt
   *   2. If required keys are missing → retry once with a stricter repair prompt
   *   3. If still missing after retry → throw so BaseAgent.execute() records failure
   *
   * Agents call this instead of `this.llm.generate()` directly.
   */
  protected async generateWithRetry(
    prompt: string,
    required: string[],
    fallback: Record<string, unknown>,
    options?: LLMOptions,
  ): Promise<Record<string, unknown>> {
    if (!this.llm) {
      this._usedFallback = true;
      return fallback;
    }

    // Lazily import to avoid circular dep at module load time
    const { LLMOutputParser } = await import("../../ai/outputParser");

    // ── Attempt 1 ──────────────────────────────────────────────────────────
    const raw1 = await this.llm.generate(prompt, options);
    const parsed1 = LLMOutputParser.parseWithProvenance(
      raw1,
      required,
      fallback,
      this.name,
    );
    const result1 = parsed1.data;
    const missing1 = LLMOutputParser.validateKeys(result1, required);
    if (missing1.length === 0) {
      // Calling the model is not the same as the model authoring the result.
      // An unparseable response substitutes the whole fallback, and a missing
      // required key is repaired from it; either way the accepted artifact
      // depends on canned content and must not be reported as AI-authored.
      this.recordFallbackUsage(parsed1.fallbackUsage);
      return result1;
    }

    // ── Attempt 2: stricter repair prompt ──────────────────────────────────
    console.warn(
      `[${this.name}] First attempt missing keys [${missing1.join(", ")}] — retrying with strict prompt`,
    );
    const retryPrompt = LLMOutputParser.buildRetryPrompt(
      prompt,
      raw1,
      required,
    );
    const raw2 = await this.llm.generate(retryPrompt, {
      ...options,
      temperature: 0.1,
    });
    const parsed2 = LLMOutputParser.parseWithProvenance(
      raw2,
      required,
      fallback,
      this.name,
    );
    const result2 = parsed2.data;
    const missing2 = LLMOutputParser.validateKeys(result2, required);

    if (missing2.length > 0) {
      // Still invalid after retry — throw so the pipeline records step.failed
      throw new Error(
        `[${this.name}] LLM output still missing required keys after retry: [${missing2.join(", ")}]`,
      );
    }

    // Provenance describes the result actually returned. Attempt 1's output is
    // discarded, so its fallback usage must not colour a clean retry.
    this.recordFallbackUsage(parsed2.fallbackUsage);
    return result2;
  }

  /**
   * Mark this run as fallback-dependent unless the model authored everything.
   *
   * Kept separate so the rule lives in one place: any deterministic fallback
   * contribution, whole-object or per-key, disqualifies the result from being
   * reported as AI-authored.
   */
  private recordFallbackUsage(usage: "none" | "partial" | "full"): void {
    if (usage !== "none") {
      this._usedFallback = true;
    }
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
