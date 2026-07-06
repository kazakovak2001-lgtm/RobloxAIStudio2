/**
 * Generation Pipeline Coordinator — public API (v2.1)
 */

export {
  GenerationCoordinator,
  type GenerationRequest,
  type GenerationResult,
} from "./GenerationCoordinator";
export { GenerationContextBuilder } from "./GenerationContext";
export {
  AgentExecutionManager,
  AgentDependencyResolver,
  type AgentExecutionResult,
} from "./AgentExecutionManager";
export { ArtifactAssembler, type AssemblyResult } from "./ArtifactAssembler";
export { GenerationPackageBuilder } from "./GenerationPackageBuilder";
export { PipelineIntegrityValidator } from "./PipelineIntegrityValidator";
export {
  ProjectStructureValidator,
  type StructureValidationResult,
} from "./ProjectStructureValidator";
export type {
  GenerationSession,
  GenerationContext,
  GeneratedArtifact,
  GenerationPackage,
  GenerationManifest,
  PackageValidationReport,
  GenerationMetrics,
  StageRecord,
} from "./types";
export { createSessionId, createArtifactId } from "./types";
