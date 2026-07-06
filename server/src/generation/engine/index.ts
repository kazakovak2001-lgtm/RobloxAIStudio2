/**
 * Generation Engine — public API (v2.2)
 */

export {
  GenerationEngine,
  type GenerationEngineConfig,
  type GenerationEngineResult,
  type EngineEvent,
  type EngineEventType,
  type EngineEventListener,
} from "./GenerationEngine";
export { GenerationEngineFactory } from "./GenerationEngineFactory";
export { GeneratorRegistry } from "./GeneratorRegistry";
export {
  BaseGenerator,
  type GeneratorInput,
  type GeneratorOutput,
  type GeneratorMetadata,
} from "./BaseGenerator";
export {
  GenerationDependencyResolver,
  type ResolutionResult,
} from "./GenerationDependencyResolver";
export {
  GenerationModelValidator,
  type ModelValidationResult,
} from "./GenerationModelValidator";
export { GenerationCache, type CacheStats } from "./GenerationCache";
export {
  GenerationSessionManager,
  type EngineSession,
} from "./GenerationSessionManager";
export {
  createEngineContext,
  type EngineContext,
} from "./GenerationEngineContext";
export type {
  GenerationModel,
  GameMetadata,
  ScriptDefinition,
  ModuleDefinition,
  ServiceDefinition,
  FolderDefinition,
  AssetDefinition,
  UIDefinition,
  NetworkingDefinition,
  ConfigurationSet,
  DependencyEntry,
} from "./GenerationModel";
export { createEmptyModel } from "./GenerationModel";
