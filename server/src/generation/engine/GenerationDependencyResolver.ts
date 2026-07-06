/**
 * GenerationDependencyResolver.ts
 *
 * Resolves generator execution order based on declared dependencies.
 * Detects circular references and enforces valid execution order.
 */

import type { BaseGenerator } from "./BaseGenerator";

export interface ResolutionResult {
  valid: boolean;
  order: string[];
  cycles: string[][];
}

export class GenerationDependencyResolver {
  /**
   * Resolve execution order from a set of generators.
   * Returns topological sort or detected cycles.
   */
  resolve(generators: BaseGenerator[]): ResolutionResult {
    const graph = new Map<string, string[]>();
    const allIds = new Set<string>();

    for (const gen of generators) {
      allIds.add(gen.metadata.id);
      graph.set(
        gen.metadata.id,
        gen.metadata.dependencies.filter(
          (d) => allIds.has(d) || generators.some((g) => g.metadata.id === d),
        ),
      );
    }

    // Ensure all referenced deps exist in graph
    for (const gen of generators) {
      for (const dep of gen.metadata.dependencies) {
        if (!graph.has(dep)) graph.set(dep, []);
        allIds.add(dep);
      }
    }

    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    for (const id of allIds) inDegree.set(id, 0);

    for (const [id, deps] of graph) {
      for (const _dep of deps) {
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const [id, deps] of graph) {
        if (deps.includes(current)) {
          inDegree.set(id, (inDegree.get(id) ?? 0) - 1);
          if (inDegree.get(id) === 0) {
            queue.push(id);
          }
        }
      }
    }

    // Detect cycles (nodes not in sorted output)
    const cycles: string[][] = [];
    if (sorted.length < allIds.size) {
      const remaining = [...allIds].filter((id) => !sorted.includes(id));
      if (remaining.length > 0) {
        cycles.push(remaining);
      }
    }

    // Filter sorted to only include registered generators
    const registeredIds = new Set(generators.map((g) => g.metadata.id));
    const order = sorted.filter((id) => registeredIds.has(id));

    return {
      valid: cycles.length === 0,
      order,
      cycles,
    };
  }

  /**
   * Validate a dependency graph without executing.
   */
  validate(generators: BaseGenerator[]): { valid: boolean; errors: string[] } {
    const result = this.resolve(generators);
    const errors: string[] = [];

    if (!result.valid) {
      for (const cycle of result.cycles) {
        errors.push(`Circular dependency detected: ${cycle.join(" → ")}`);
      }
    }

    // Check for missing dependencies
    const allIds = new Set(generators.map((g) => g.metadata.id));
    for (const gen of generators) {
      for (const dep of gen.metadata.dependencies) {
        if (!allIds.has(dep)) {
          errors.push(
            `Generator "${gen.metadata.id}" depends on unregistered "${dep}"`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
