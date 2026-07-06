/**
 * PluginLifecycleManager.ts
 *
 * Manages plugin lifecycle: install → enable → disable → deprecate → uninstall.
 * Emits events for each state transition (consumable by EventStore).
 */

import {
  PluginRegistry,
  getPluginRegistry,
  type CompilerPlugin,
  type PluginStatus,
} from "./PluginRegistry";
import { ExtensionPointManager } from "./ExtensionPointManager";

export interface LifecycleEvent {
  pluginId: string;
  transition: string;
  fromStatus: PluginStatus;
  toStatus: PluginStatus;
  timestamp: Date;
}

export class PluginLifecycleManager {
  private registry: PluginRegistry;
  private extensions: ExtensionPointManager;
  private history: LifecycleEvent[] = [];

  constructor(registry?: PluginRegistry, extensions?: ExtensionPointManager) {
    this.registry = registry ?? getPluginRegistry();
    this.extensions = extensions ?? new ExtensionPointManager(this.registry);
  }

  /**
   * Install a new plugin.
   */
  install(plugin: CompilerPlugin): void {
    this.registry.registerPlugin({
      ...plugin,
      status: "installed",
      enabled: false,
    });
    this.recordTransition(plugin.pluginId, "installed", "installed", "install");
    console.log(
      `[LIFECYCLE] Installed | Plugin: ${plugin.pluginId} v${plugin.version}`,
    );
  }

  /**
   * Enable an installed plugin — activates its hooks.
   */
  enable(pluginId: string): boolean {
    const plugin = this.registry.getPlugin(pluginId);
    if (!plugin) return false;

    const fromStatus = plugin.status;
    this.registry.setStatus(pluginId, "enabled");

    // Register hooks
    if (plugin.hooks.onBeforeBuild)
      this.extensions.registerHook("build", "before", pluginId);
    if (plugin.hooks.onAfterBuild)
      this.extensions.registerHook("build", "after", pluginId);
    if (plugin.hooks.onBeforeCI)
      this.extensions.registerHook("ci", "before", pluginId);
    if (plugin.hooks.onAfterCI)
      this.extensions.registerHook("ci", "after", pluginId);
    if (plugin.hooks.onBeforeStage)
      this.extensions.registerHook("assembly", "before", pluginId);
    if (plugin.hooks.onAfterStage)
      this.extensions.registerHook("assembly", "after", pluginId);

    this.recordTransition(pluginId, fromStatus, "enabled", "enable");
    console.log(`[LIFECYCLE] Enabled | Plugin: ${pluginId}`);
    return true;
  }

  /**
   * Disable a plugin — deactivates hooks but keeps it installed.
   */
  disable(pluginId: string): boolean {
    const plugin = this.registry.getPlugin(pluginId);
    if (!plugin) return false;

    const fromStatus = plugin.status;
    this.registry.setStatus(pluginId, "disabled");
    this.extensions.removePluginHooks(pluginId);

    this.recordTransition(pluginId, fromStatus, "disabled", "disable");
    console.log(`[LIFECYCLE] Disabled | Plugin: ${pluginId}`);
    return true;
  }

  /**
   * Mark a plugin as deprecated (still functional but will be removed).
   */
  deprecate(pluginId: string): boolean {
    const plugin = this.registry.getPlugin(pluginId);
    if (!plugin) return false;

    const fromStatus = plugin.status;
    this.registry.setStatus(pluginId, "deprecated");
    this.recordTransition(pluginId, fromStatus, "deprecated", "deprecate");
    return true;
  }

  /**
   * Uninstall a plugin completely.
   */
  uninstall(pluginId: string): boolean {
    const plugin = this.registry.getPlugin(pluginId);
    if (!plugin) return false;

    this.extensions.removePluginHooks(pluginId);
    this.registry.unregisterPlugin(pluginId);
    this.recordTransition(pluginId, plugin.status, "installed", "uninstall");
    console.log(`[LIFECYCLE] Uninstalled | Plugin: ${pluginId}`);
    return true;
  }

  /**
   * Update a plugin version (reinstall with new version).
   */
  update(pluginId: string, newPlugin: CompilerPlugin): boolean {
    const existing = this.registry.getPlugin(pluginId);
    if (!existing) return false;

    const wasEnabled = existing.enabled;
    this.uninstall(pluginId);
    this.install(newPlugin);
    if (wasEnabled) this.enable(pluginId);

    console.log(
      `[LIFECYCLE] Updated | Plugin: ${pluginId} → v${newPlugin.version}`,
    );
    return true;
  }

  /**
   * Get lifecycle history for audit.
   */
  getHistory(): ReadonlyArray<LifecycleEvent> {
    return this.history;
  }

  getExtensionPointManager(): ExtensionPointManager {
    return this.extensions;
  }

  private recordTransition(
    pluginId: string,
    fromStatus: PluginStatus,
    toStatus: PluginStatus,
    transition: string,
  ): void {
    this.history.push({
      pluginId,
      transition,
      fromStatus,
      toStatus,
      timestamp: new Date(),
    });
  }
}
