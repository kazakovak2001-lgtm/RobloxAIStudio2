/**
 * PluginSDK.ts
 *
 * Public SDK interface for plugin developers.
 * Provides safe, read-only access to compiler context.
 * Plugins use this API — never internal modules directly.
 *
 * Guarantees:
 *  - No core state mutation
 *  - Read-only EventStore access (subscribe only)
 *  - Scoped logging (prefixed with plugin ID)
 *  - No access to AssemblyRegistry, JobQueue, or Governance internals
 */

import type { PluginContext } from "./PluginSandbox";

export interface PluginSDKConfig {
  pluginId: string;
  version: string;
}

export type PluginEventHandler = (event: {
  type: string;
  payload: unknown;
  timestamp: Date;
}) => void;

/**
 * SDK instance provided to each plugin at execution time.
 * One instance per plugin per execution.
 */
export class PluginSDK {
  private pluginId: string;
  private version: string;
  private subscriptions: Array<{
    eventType: string;
    handler: PluginEventHandler;
  }> = [];
  private logs: string[] = [];

  constructor(config: PluginSDKConfig) {
    this.pluginId = config.pluginId;
    this.version = config.version;
  }

  /**
   * Get the current pipeline context (read-only).
   */
  getContext(context: PluginContext): Readonly<PluginContext> {
    return Object.freeze({ ...context });
  }

  /**
   * Subscribe to system events (read-only observation).
   * Events are delivered after they occur — plugins cannot intercept or modify them.
   */
  subscribe(eventType: string, handler: PluginEventHandler): void {
    this.subscriptions.push({ eventType, handler });
  }

  /**
   * Emit a structured log message (scoped to this plugin).
   */
  log(message: string, level: "info" | "warn" | "error" = "info"): void {
    const entry = `[PLUGIN:${this.pluginId}] [${level.toUpperCase()}] ${message}`;
    this.logs.push(entry);
    if (level === "error") {
      console.error(entry);
    } else if (level === "warn") {
      console.warn(entry);
    } else {
      console.log(entry);
    }
  }

  /**
   * Read plugin metadata.
   */
  getMetadata(): { pluginId: string; version: string } {
    return { pluginId: this.pluginId, version: this.version };
  }

  /**
   * Get all subscriptions (used by sandbox to deliver events).
   */
  getSubscriptions(): ReadonlyArray<{
    eventType: string;
    handler: PluginEventHandler;
  }> {
    return this.subscriptions;
  }

  /**
   * Get collected logs (for audit/debugging).
   */
  getLogs(): ReadonlyArray<string> {
    return this.logs;
  }

  /**
   * Store a value in plugin-scoped storage.
   * This is the ONLY mutable state a plugin is allowed to use.
   */
  setStorage(context: PluginContext, key: string, value: unknown): void {
    context.storage[key] = value;
  }

  /**
   * Read a value from plugin-scoped storage.
   */
  getStorage(context: PluginContext, key: string): unknown {
    return context.storage[key];
  }
}

/**
 * Factory function for creating SDK instances (used by PluginSandbox).
 */
export function createPluginSDK(pluginId: string, version: string): PluginSDK {
  return new PluginSDK({ pluginId, version });
}
