/**
 * GeneratorExecutionGraph.ts
 *
 * Builds and validates the execution graph for generators.
 * Wrapper around GenerationDependencyResolver with execution tracking.
 */

import type { BaseGenerator } from "./BaseGenerator";
import {
  GenerationDependencyResolver,
  type ResolutionResult,
} from "./GenerationDependencyResolver";

export interface ExecutionGraphNode {
  id: string;
  name: string;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  durationMs?: number;
}

export class GeneratorExecutionGraph {
  private resolver: GenerationDependencyResolver;
  private nodes: Map<string, ExecutionGraphNode> = new Map();
  private resolution: ResolutionResult | null = null;

  constructor() {
    this.resolver = new GenerationDependencyResolver();
  }

  /**
   * Build the execution graph from generators.
   */
  build(generators: BaseGenerator[]): { valid: boolean; errors: string[] } {
    this.nodes.clear();

    for (const gen of generators) {
      this.nodes.set(gen.metadata.id, {
        id: gen.metadata.id,
        name: gen.metadata.name,
        dependencies: gen.metadata.dependencies,
        status: "pending",
      });
    }

    this.resolution = this.resolver.resolve(generators);
    const validation = this.resolver.validate(generators);

    return { valid: validation.valid, errors: validation.errors };
  }

  /**
   * Get the resolved execution order.
   */
  getExecutionOrder(): string[] {
    return this.resolution?.order ?? [];
  }

  /**
   * Mark a node as running.
   */
  markRunning(id: string): void {
    const node = this.nodes.get(id);
    if (node) node.status = "running";
  }

  /**
   * Mark a node as completed.
   */
  markCompleted(id: string, durationMs: number): void {
    const node = this.nodes.get(id);
    if (node) {
      node.status = "completed";
      node.durationMs = durationMs;
    }
  }

  /**
   * Mark a node as failed.
   */
  markFailed(id: string, durationMs: number): void {
    const node = this.nodes.get(id);
    if (node) {
      node.status = "failed";
      node.durationMs = durationMs;
    }
  }

  /**
   * Get all nodes.
   */
  getNodes(): ExecutionGraphNode[] {
    return [...this.nodes.values()];
  }

  /**
   * Check if graph has cycles.
   */
  hasCycles(): boolean {
    return this.resolution ? !this.resolution.valid : false;
  }

  /**
   * Get detected cycles.
   */
  getCycles(): string[][] {
    return this.resolution?.cycles ?? [];
  }
}
