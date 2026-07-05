/**
 * CompilerContextManager.ts
 *
 * Isolated runtime context per project.
 * Each project gets independent: assembly registry, CI pipeline,
 * impact cache, governance policies, telemetry.
 *
 * No shared mutable state between contexts.
 */

import { AssemblyRegistry } from "../assembly/AssemblyRegistry";
import { PolicyRegistry } from "../governance/PolicyRegistry";
import { CompilerTelemetry } from "./CompilerTelemetry";
import type { PipelineEventEmitter } from "../socket/streaming";
import { AssemblyBuilder } from "../assembly/AssemblyBuilder";
import { CIControlPipeline } from "../governance/CIControlPipeline";
import { GovernancePolicyEngine } from "../governance/GovernancePolicyEngine";

/**
 * CompilerContext — fully isolated runtime state for one project.
 */
export interface CompilerContext {
  projectId: string;
  assemblyRegistry: AssemblyRegistry;
  policyRegistry: PolicyRegistry;
  telemetry: CompilerTelemetry;
  assemblyBuilder: AssemblyBuilder;
  ciPipeline: CIControlPipeline;
  createdAt: Date;
}

export class CompilerContextManager {
  private contexts = new Map<string, CompilerContext>();

  constructor(private readonly events: PipelineEventEmitter) {}

  /**
   * Create an isolated compiler context for a project.
   * If one already exists, returns the existing one.
   */
  createContext(projectId: string, storageRoot?: string): CompilerContext {
    if (this.contexts.has(projectId)) {
      return this.contexts.get(projectId)!;
    }

    const assemblyRegistry = new AssemblyRegistry(storageRoot);
    const policyRegistry = new PolicyRegistry();
    const telemetry = new CompilerTelemetry();
    const assemblyBuilder = new AssemblyBuilder(this.events, assemblyRegistry);
    const governanceEngine = new GovernancePolicyEngine(policyRegistry);
    const ciPipeline = new CIControlPipeline(this.events, governanceEngine);

    const context: CompilerContext = {
      projectId,
      assemblyRegistry,
      policyRegistry,
      telemetry,
      assemblyBuilder,
      ciPipeline,
      createdAt: new Date(),
    };

    this.contexts.set(projectId, context);
    console.log(`[CONTEXT] Created | Project: ${projectId}`);
    return context;
  }

  /**
   * Get an existing context. Returns null if not found.
   */
  getContext(projectId: string): CompilerContext | null {
    return this.contexts.get(projectId) ?? null;
  }

  /**
   * Check if a context exists for a project.
   */
  hasContext(projectId: string): boolean {
    return this.contexts.has(projectId);
  }

  /**
   * Destroy a context and release all associated resources.
   * Removes all runtime state for the project.
   */
  destroyContext(projectId: string): boolean {
    const existed = this.contexts.delete(projectId);
    if (existed) {
      console.log(`[CONTEXT] Destroyed | Project: ${projectId}`);
    }
    return existed;
  }

  /**
   * Get all active project IDs.
   */
  listContextIds(): string[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Get aggregated telemetry across all projects.
   */
  getGlobalTelemetry(): Record<
    string,
    ReturnType<CompilerTelemetry["getSummary"]>
  > {
    const result: Record<
      string,
      ReturnType<CompilerTelemetry["getSummary"]>
    > = {};
    for (const [id, ctx] of this.contexts) {
      result[id] = ctx.telemetry.getSummary();
    }
    return result;
  }

  get size(): number {
    return this.contexts.size;
  }
}
