import type { AgentEvaluationSpec } from "./Evaluator";
import type { EvaluationResult } from "./EvaluationResult";
import { Evaluator } from "./Evaluator";

/**
 * EvaluationRegistry
 *
 * Stores AgentEvaluationSpec entries keyed by agent type and exposes a
 * single evaluate() method used by AIPipelineIntegrator after each step.
 *
 * Specs are pre-loaded for all 8 pipeline stages. Custom specs can be
 * registered at startup via registerSpec().
 */
export class EvaluationRegistry {
  private specs = new Map<string, AgentEvaluationSpec>();

  constructor() {
    this.loadDefaults();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Register or replace an evaluation spec for an agent type.
   */
  registerSpec(spec: AgentEvaluationSpec): void {
    this.specs.set(spec.agentType, spec);
  }

  /**
   * Evaluate an agent output. Returns a fallback result if no spec is found.
   */
  evaluate(
    agentType: string,
    output: Record<string, unknown>,
  ): EvaluationResult {
    const spec = this.specs.get(agentType);
    if (!spec) {
      // No spec registered — minimal pass-through evaluation
      return Evaluator.evaluate(agentType, output, {
        agentType,
        requiredKeys: [],
        thresholds: { failed: 0, warning: 0 },
      });
    }
    return Evaluator.evaluate(agentType, output, spec);
  }

  /**
   * Check whether a spec is registered for the given agent type.
   */
  hasSpec(agentType: string): boolean {
    return this.specs.has(agentType);
  }

  // ─── Default specs for all 8 pipeline stages ─────────────────────────────

  private loadDefaults(): void {
    // ── requirements ──────────────────────────────────────────────────────
    this.registerSpec({
      agentType: "requirements",
      requiredKeys: ["requirements"],
      objectKeys: ["requirements"],
      nestedChecks: {
        requirements: ["functional", "constraints", "success_criteria"],
      },
      recommendations: [
        "Ensure requirements include at least 3 functional items",
        "Add non-functional requirements (performance, scalability)",
      ],
    });

    // ── planner ───────────────────────────────────────────────────────────
    this.registerSpec({
      agentType: "planner",
      requiredKeys: ["plan"],
      objectKeys: ["plan"],
      nestedChecks: {
        plan: ["phases", "timeline", "milestones"],
      },
      recommendations: ["Ensure plan includes at least 2 phases"],
    });

    // ── game_designer ─────────────────────────────────────────────────────
    this.registerSpec({
      agentType: "game_designer",
      requiredKeys: ["gameplay"],
      objectKeys: ["gameplay"],
      stringKeys: ["loop", "winCondition", "loseCondition"],
      nestedChecks: {
        gameplay: ["mechanics", "progression", "balance"],
      },
      recommendations: [
        "Define at least 3 gameplay mechanics",
        "Specify win and lose conditions",
      ],
    });

    // ── roblox_architect ──────────────────────────────────────────────────
    this.registerSpec({
      agentType: "roblox_architect",
      requiredKeys: ["architecture", "roblox_architect"],
      objectKeys: ["architecture", "roblox_architect"],
      nestedChecks: {
        architecture: ["folderStructure", "dataModels", "services"],
        roblox_architect: [
          "client_architecture",
          "server_architecture",
          "networking",
        ],
      },
      recommendations: [
        "Define at least 3 server services",
        "Specify replication model",
      ],
    });

    // ── lua_generator ─────────────────────────────────────────────────────
    this.registerSpec({
      agentType: "lua_generator",
      requiredKeys: ["lua_generator"],
      objectKeys: ["lua_generator"],
      nestedChecks: {
        lua_generator: ["server", "client", "shared"],
      },
      recommendations: [
        "Generate at least 2 server scripts",
        "Include a shared GameConfig module",
      ],
    });

    // ── ui_generator ──────────────────────────────────────────────────────
    this.registerSpec({
      agentType: "ui_generator",
      requiredKeys: ["uiDesign"],
      objectKeys: ["uiDesign"],
      nestedChecks: {
        uiDesign: ["screens"],
      },
      recommendations: ["Include HUD, Main Menu, and Pause Menu screens"],
    });

    // ── asset_planner ─────────────────────────────────────────────────────
    this.registerSpec({
      agentType: "asset_planner",
      requiredKeys: ["assetPlan"],
      objectKeys: ["assetPlan"],
      nestedChecks: {
        assetPlan: ["models", "textures", "sounds", "animations"],
      },
      recommendations: [
        "Plan at least 3 models",
        "Include background music and SFX",
      ],
    });

    // ── orchestrator (final stage, stepId = "final") ──────────────────────
    this.registerSpec({
      agentType: "final",
      requiredKeys: ["status", "world", "systems"],
      objectKeys: ["world"],
      stringKeys: ["name", "description"],
      nestedChecks: {
        world: ["name", "description"],
      },
      recommendations: [
        "Synthesise at least 3 world places",
        "Map all gameplay systems to world hooks",
      ],
    });
  }
}

/**
 * Singleton default registry.
 * AIPipelineIntegrator imports this directly.
 */
let _defaultRegistry: EvaluationRegistry | null = null;

export function getDefaultEvaluationRegistry(): EvaluationRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new EvaluationRegistry();
  }
  return _defaultRegistry;
}
