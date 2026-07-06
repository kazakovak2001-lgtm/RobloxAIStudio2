/**
 * PipelineIntegrityValidator.ts
 *
 * Validates the integrity of a complete generation pipeline execution.
 * Checks:
 *   - Every expected stage executed
 *   - Every required artifact exists
 *   - No missing dependencies
 *   - No duplicated outputs
 *   - No unresolved references
 */

import type {
  GenerationContext,
  PackageValidationReport,
  GeneratedArtifact,
} from "./types";
import { ArtifactAssembler } from "./ArtifactAssembler";

const EXPECTED_STAGES = [
  "planning",
  "execution",
  "artifact-assembly",
  "validation",
];

export class PipelineIntegrityValidator {
  private assembler: ArtifactAssembler;

  constructor() {
    this.assembler = new ArtifactAssembler();
  }

  /**
   * Validate the entire pipeline execution.
   */
  validate(
    ctx: GenerationContext,
    artifacts: GeneratedArtifact[],
  ): PackageValidationReport {
    const completedStages = ctx.stages
      .filter((s) => s.status === "completed")
      .map((s) => s.name);
    const missingDependencies: string[] = [];
    const duplicatedOutputs: string[] = [];

    // Check expected stages
    for (const expected of EXPECTED_STAGES) {
      if (!completedStages.includes(expected)) {
        missingDependencies.push(`Stage "${expected}" did not execute`);
      }
    }

    // Check for duplicated artifact paths
    const paths = new Set<string>();
    for (const art of artifacts) {
      if (paths.has(art.path)) {
        duplicatedOutputs.push(art.path);
      }
      paths.add(art.path);
    }

    // Check references
    const refCheck = this.assembler.verifyReferences(artifacts);

    // Structure validation
    const structureValid = artifacts.length > 0 && completedStages.length >= 2;

    return {
      valid:
        missingDependencies.length === 0 &&
        duplicatedOutputs.length === 0 &&
        refCheck.valid &&
        structureValid,
      stagesExecuted: completedStages.length,
      stagesExpected: EXPECTED_STAGES.length,
      artifactsGenerated: artifacts.length,
      missingDependencies,
      duplicatedOutputs,
      unresolvedReferences: refCheck.unresolved,
      structureValid,
    };
  }
}
