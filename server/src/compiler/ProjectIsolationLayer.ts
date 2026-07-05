/**
 * ProjectIsolationLayer.ts
 *
 * Hard boundary enforcement between projects.
 * Prevents cross-project data leakage, validates context ownership,
 * and ensures all operations resolve projectId before execution.
 */

import {
  CompilerContextManager,
  type CompilerContext,
} from "./CompilerContextManager";
import { ProjectRegistry } from "./ProjectRegistry";
import {
  CompilerErrorBoundary,
  type CompilerError,
} from "./CompilerErrorBoundary";

export type IsolationCheckResult =
  | { allowed: true; context: CompilerContext }
  | { allowed: false; error: CompilerError };

export class ProjectIsolationLayer {
  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly contextManager: CompilerContextManager,
  ) {}

  /**
   * Validate that a projectId is valid, active, and has an initialized context.
   * Returns the context if allowed, or a structured error if blocked.
   */
  resolveContext(projectId: string): IsolationCheckResult {
    // 1. Project must exist
    const project = this.projectRegistry.getProject(projectId);
    if (!project) {
      return {
        allowed: false,
        error: CompilerErrorBoundary.capture(
          new Error(`Project "${projectId}" does not exist`),
          "isolation",
          "ValidationError",
        ),
      };
    }

    // 2. Project must be active
    if (project.status !== "active") {
      return {
        allowed: false,
        error: CompilerErrorBoundary.capture(
          new Error(
            `Project "${projectId}" is ${project.status} — operations are blocked`,
          ),
          "isolation",
          "GovernanceError",
        ),
      };
    }

    // 3. Context must be initialized
    let context = this.contextManager.getContext(projectId);
    if (!context) {
      // Auto-initialize context for active projects
      context = this.contextManager.createContext(
        projectId,
        project.storageRoot,
      );
    }

    return { allowed: true, context };
  }

  /**
   * Validate that an assemblyId belongs to a specific project context.
   * Prevents accessing another project's assemblies.
   */
  validateOwnership(
    projectId: string,
    assemblyId: string,
  ): { valid: true } | { valid: false; error: CompilerError } {
    const check = this.resolveContext(projectId);
    if (!check.allowed) {
      return { valid: false, error: check.error };
    }

    // Assembly must exist in this project's registry
    if (!check.context.assemblyRegistry.has(assemblyId)) {
      return {
        valid: false,
        error: CompilerErrorBoundary.capture(
          new Error(
            `Assembly "${assemblyId}" does not belong to project "${projectId}"`,
          ),
          "isolation",
          "ValidationError",
        ),
      };
    }

    return { valid: true };
  }

  /**
   * Ensure no cross-project reference exists in the given data.
   * Checks that all referenced IDs resolve within the same project.
   */
  validateNoCrossProjectRefs(
    projectId: string,
    referencedIds: string[],
  ): string[] {
    const context = this.contextManager.getContext(projectId);
    if (!context) return referencedIds; // all invalid if no context

    const violations: string[] = [];
    for (const id of referencedIds) {
      if (!context.assemblyRegistry.has(id)) {
        violations.push(id);
      }
    }
    return violations;
  }
}
