/**
 * Lua Code Generation Engine — public API (v2.5)
 */

export {
  LuaGenerationEngine,
  type LuaGenerationResult,
  type LuaGenerationMetrics,
} from "./LuaGenerationEngine";
export { LuaFormatter } from "./LuaFormatter";
export {
  LuaRequireResolver,
  type RequireResolution,
  type RequireGraphNode,
} from "./LuaRequireResolver";
export { ServerScriptBuilder } from "./builders/ServerScriptBuilder";
export { LocalScriptBuilder } from "./builders/LocalScriptBuilder";
export { ModuleScriptBuilder } from "./builders/ModuleScriptBuilder";
export { ConfigurationScriptBuilder } from "./builders/ConfigurationScriptBuilder";
export type { BuiltLuaFile } from "./builders/ServerScriptBuilder";
export {
  LuaCodeValidator,
  type CodeValidationResult,
} from "./validators/LuaCodeValidator";
export {
  LuaNamingValidator,
  type NamingValidationResult,
} from "./validators/LuaNamingValidator";
export {
  LuaDependencyValidator,
  type DependencyValidationResult,
} from "./validators/LuaDependencyValidator";
export {
  BaseLuaTemplate,
  type TemplateContext,
} from "./templates/BaseLuaTemplate";
export { ScriptTemplate } from "./templates/ScriptTemplate";
export { ModuleTemplate } from "./templates/ModuleTemplate";
export { ServiceTemplate } from "./templates/ServiceTemplate";
export { ConfigurationTemplate } from "./templates/ConfigurationTemplate";
