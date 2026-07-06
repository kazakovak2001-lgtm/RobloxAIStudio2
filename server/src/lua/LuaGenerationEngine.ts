/**
 * LuaGenerationEngine.ts
 *
 * Transforms a validated GenerationModel into production Lua source files.
 * Coordinates: templates → builders → validation → formatting → assembly.
 */

import type { GenerationModel } from "../generation/engine/GenerationModel";
import { ServerScriptBuilder } from "./builders/ServerScriptBuilder";
import { LocalScriptBuilder } from "./builders/LocalScriptBuilder";
import { ModuleScriptBuilder } from "./builders/ModuleScriptBuilder";
import { ConfigurationScriptBuilder } from "./builders/ConfigurationScriptBuilder";
import {
  LuaCodeValidator,
  type CodeValidationResult,
} from "./validators/LuaCodeValidator";
import { LuaNamingValidator } from "./validators/LuaNamingValidator";
import { LuaDependencyValidator } from "./validators/LuaDependencyValidator";
import {
  LuaRequireResolver,
  type RequireResolution,
} from "./LuaRequireResolver";
import type { BuiltLuaFile } from "./builders/ServerScriptBuilder";

export interface LuaGenerationResult {
  success: boolean;
  files: BuiltLuaFile[];
  totalFiles: number;
  totalLines: number;
  totalSize: number;
  validation: CodeValidationResult;
  requireResolution: RequireResolution;
  metrics: LuaGenerationMetrics;
  error?: string;
}

export interface LuaGenerationMetrics {
  generationDurationMs: number;
  validationDurationMs: number;
  formattingDurationMs: number;
  dependencyResolutionMs: number;
  totalDurationMs: number;
  fileCount: number;
  lineCount: number;
}

export class LuaGenerationEngine {
  private serverBuilder = new ServerScriptBuilder();
  private localBuilder = new LocalScriptBuilder();
  private moduleBuilder = new ModuleScriptBuilder();
  private configBuilder = new ConfigurationScriptBuilder();
  private codeValidator = new LuaCodeValidator();
  private namingValidator = new LuaNamingValidator();
  private depValidator = new LuaDependencyValidator();
  private requireResolver = new LuaRequireResolver();

  /**
   * Generate all Lua files from a GenerationModel.
   */
  generate(model: GenerationModel): LuaGenerationResult {
    const totalStart = Date.now();

    try {
      // Generation phase
      const genStart = Date.now();
      const serverScripts = this.serverBuilder.build(model.scripts);
      const clientScripts = this.localBuilder.build(model.scripts);
      const modules = this.moduleBuilder.build(model.modules);
      const configs = this.configBuilder.build(
        model.configuration,
        model.game.title,
      );
      const generationDurationMs = Date.now() - genStart;

      const allFiles = [
        ...serverScripts,
        ...clientScripts,
        ...modules,
        ...configs,
      ];

      // Dependency resolution
      const depStart = Date.now();
      const requireResolution = this.requireResolver.resolve(
        model.modules,
        model.scripts,
      );
      const dependencyResolutionMs = Date.now() - depStart;

      // Validation phase
      const valStart = Date.now();
      const codeValidation = this.codeValidator.validate(allFiles);
      const namingValidation = this.namingValidator.validate(allFiles);
      const depValidation = this.depValidator.validate(allFiles);
      const validationDurationMs = Date.now() - valStart;

      // Merge validation results
      const mergedValidation: CodeValidationResult = {
        valid:
          codeValidation.valid && namingValidation.valid && depValidation.valid,
        filesChecked: codeValidation.filesChecked,
        errors: [
          ...codeValidation.errors,
          ...namingValidation.errors.map((e) => ({ path: "", message: e })),
          ...namingValidation.duplicates.map((d) => ({ path: "", message: d })),
          ...depValidation.errors.map((e) => ({ path: "", message: e })),
        ],
        warnings: codeValidation.warnings,
      };

      const totalLines = allFiles.reduce((sum, f) => sum + f.lines, 0);
      const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);

      return {
        success: mergedValidation.valid && requireResolution.valid,
        files: allFiles,
        totalFiles: allFiles.length,
        totalLines,
        totalSize,
        validation: mergedValidation,
        requireResolution,
        metrics: {
          generationDurationMs,
          validationDurationMs,
          formattingDurationMs: 0, // formatting is inline in builders
          dependencyResolutionMs,
          totalDurationMs: Date.now() - totalStart,
          fileCount: allFiles.length,
          lineCount: totalLines,
        },
        error: mergedValidation.valid
          ? undefined
          : `${mergedValidation.errors.length} validation error(s)`,
      };
    } catch (err) {
      return {
        success: false,
        files: [],
        totalFiles: 0,
        totalLines: 0,
        totalSize: 0,
        validation: {
          valid: false,
          filesChecked: 0,
          errors: [
            {
              path: "",
              message: err instanceof Error ? err.message : String(err),
            },
          ],
          warnings: [],
        },
        requireResolution: {
          valid: false,
          order: [],
          cycles: [],
          errors: [err instanceof Error ? err.message : String(err)],
        },
        metrics: {
          generationDurationMs: 0,
          validationDurationMs: 0,
          formattingDurationMs: 0,
          dependencyResolutionMs: 0,
          totalDurationMs: Date.now() - totalStart,
          fileCount: 0,
          lineCount: 0,
        },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
