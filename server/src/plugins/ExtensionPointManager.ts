/**
 * ExtensionPointManager.ts
 *
 * Defines safe injection points in the compiler pipeline.
 * Manages execution order of plugins per stage.
 * Ensures deterministic execution sequence.
 */

import {
  PluginRegistry,
  getPluginRegistry,
  type PluginHooks,
  type CompilerPlugin,
} from "./PluginRegistry";
import {
  PluginSandbox,
  type PluginContext,
  type PluginResult,
} from "./PluginSandbox";

export type PipelineStage =
  | "build"
  | "ci"
  | "replay"
  | "diff"
  | "impact"
  | "governance"
  | "assembly"
  | "generation";

export interface HookRegistration {
  stage: PipelineStage;
  position: "before" | "after";
  pluginId: string;
  priority: number; // lower = executes first
}

export class ExtensionPointManager {
  private hooks: HookRegistration[] = [];
  private registry: PluginRegistry;
  private sandbox: PluginSandbox;

  constructor(registry?: PluginRegistry, sandbox?: PluginSandbox) {
    this.registry = registry ?? getPluginRegistry();
    this.sandbox = sandbox ?? new PluginSandbox();
  }

  /**
   * Register a hook for a specific pipeline stage.
   */
  registerHook(
    stage: PipelineStage,
    position: "before" | "after",
    pluginId: string,
    priority = 50,
  ): void {
    this.hooks.push({ stage, position, pluginId, priority });
    // Keep sorted by priority for deterministic execution
    this.hooks.sort((a, b) => a.priority - b.priority);
    console.log(
      `[EXTENSION] Hook registered | Stage: ${stage} | Position: ${position} | Plugin: ${pluginId}`,
    );
  }

  /**
   * Execute all "before" hooks for a given pipeline stage.
   * Returns array of results. Failures are logged but do not block pipeline.
   */
  async executeBefore(
    stage: PipelineStage,
    context: PluginContext,
  ): Promise<PluginResult[]> {
    return this.executeHooksForPosition(stage, "before", context);
  }

  /**
   * Execute all "after" hooks for a given pipeline stage.
   */
  async executeAfter(
    stage: PipelineStage,
    context: PluginContext,
  ): Promise<PluginResult[]> {
    return this.executeHooksForPosition(stage, "after", context);
  }

  /**
   * Get all registered hooks for a stage.
   */
  getHooksForStage(stage: PipelineStage): HookRegistration[] {
    return this.hooks.filter((h) => h.stage === stage);
  }

  /**
   * Remove all hooks for a plugin.
   */
  removePluginHooks(pluginId: string): void {
    this.hooks = this.hooks.filter((h) => h.pluginId !== pluginId);
  }

  private async executeHooksForPosition(
    stage: PipelineStage,
    position: "before" | "after",
    context: PluginContext,
  ): Promise<PluginResult[]> {
    const relevantHooks = this.hooks.filter(
      (h) => h.stage === stage && h.position === position,
    );

    const results: PluginResult[] = [];

    for (const hook of relevantHooks) {
      const plugin = this.registry.getPlugin(hook.pluginId);
      if (!plugin || !plugin.enabled) continue;

      const hookName = this.resolveHookName(stage, position);
      if (!hookName || !plugin.hooks[hookName]) continue;

      const result = await this.sandbox.execute(plugin, hookName, {
        ...context,
        stage,
      });
      results.push(result);

      // Mark plugin as failed if it errors repeatedly (not implemented: simple tracking)
      if (!result.success && result.sandboxViolations.length > 0) {
        this.registry.setStatus(plugin.pluginId, "failed");
      }
    }

    return results;
  }

  private resolveHookName(
    stage: PipelineStage,
    position: "before" | "after",
  ): keyof PluginHooks | null {
    if (stage === "build" && position === "before") return "onBeforeBuild";
    if (stage === "build" && position === "after") return "onAfterBuild";
    if (stage === "ci" && position === "before") return "onBeforeCI";
    if (stage === "ci" && position === "after") return "onAfterCI";
    // Generic stage hooks
    if (position === "before") return "onBeforeStage";
    if (position === "after") return "onAfterStage";
    return null;
  }
}
