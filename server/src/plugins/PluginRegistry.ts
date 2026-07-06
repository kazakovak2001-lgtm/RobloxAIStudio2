/**
 * PluginRegistry.ts
 *
 * Central registry for all installed compiler plugins.
 * Manages plugin lifecycle states and provides lookup.
 */

export type SandboxLevel = "strict" | "restricted";
export type PluginStatus =
  "installed" | "enabled" | "disabled" | "deprecated" | "failed";

export type PluginHookFn = (context: unknown) => Promise<unknown> | unknown;

export interface PluginHooks {
  onBeforeBuild?: PluginHookFn;
  onAfterBuild?: PluginHookFn;
  onBeforeCI?: PluginHookFn;
  onAfterCI?: PluginHookFn;
  onBeforeStage?: PluginHookFn;
  onAfterStage?: PluginHookFn;
}

export interface CompilerPlugin {
  pluginId: string;
  version: string;
  name: string;
  description?: string;
  entrypoint: string;
  hooks: PluginHooks;
  sandboxLevel: SandboxLevel;
  enabled: boolean;
  status: PluginStatus;
  installedAt: Date;
}

export class PluginRegistry {
  private plugins = new Map<string, CompilerPlugin>();

  registerPlugin(plugin: CompilerPlugin): void {
    this.plugins.set(plugin.pluginId, {
      ...plugin,
      installedAt: new Date(),
      status: plugin.enabled ? "enabled" : "installed",
    });
    console.log(
      `[PLUGIN] Registered | ID: ${plugin.pluginId} | Name: ${plugin.name} | Version: ${plugin.version}`,
    );
  }

  unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
    console.log(`[PLUGIN] Unregistered | ID: ${pluginId}`);
  }

  getPlugin(pluginId: string): CompilerPlugin | null {
    return this.plugins.get(pluginId) ?? null;
  }

  listPlugins(): CompilerPlugin[] {
    return Array.from(this.plugins.values());
  }

  listEnabled(): CompilerPlugin[] {
    return this.listPlugins().filter(
      (p) => p.enabled && p.status === "enabled",
    );
  }

  getPluginsWithHook(hookName: keyof PluginHooks): CompilerPlugin[] {
    return this.listEnabled().filter((p) => p.hooks[hookName] !== undefined);
  }

  setStatus(pluginId: string, status: PluginStatus): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.status = status;
      plugin.enabled = status === "enabled";
    }
  }

  get size(): number {
    return this.plugins.size;
  }
}

let _instance: PluginRegistry | null = null;
export function getPluginRegistry(): PluginRegistry {
  if (!_instance) _instance = new PluginRegistry();
  return _instance;
}
