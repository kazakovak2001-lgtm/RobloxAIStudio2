/**
 * EndToEndValidator.ts — Validates the complete platform pipeline.
 */

import type { PlatformComponents } from "./PlatformIntegrationManager";
import { createEmptyModel } from "../generation/engine/GenerationModel";

export interface E2EValidationReport {
  valid: boolean;
  stagesValidated: string[];
  stagesFailed: string[];
  totalDurationMs: number;
  errors: string[];
  timestamp: number;
}

export class EndToEndValidator {
  async validate(components: PlatformComponents): Promise<E2EValidationReport> {
    const start = Date.now();
    const passed: string[] = [];
    const failed: string[] = [];
    const errors: string[] = [];

    // 1. Job submission
    try {
      const { job, error } = components.jobManager.submit({
        intent: "E2E validation test game",
        constraints: [],
      });
      if (job) {
        passed.push("job-submission");
        components.jobManager.cancel(job.jobId);
      } else {
        failed.push("job-submission");
        errors.push(error ?? "Unknown");
      }
    } catch (e) {
      failed.push("job-submission");
      errors.push(String(e));
    }

    // 2. Generation coordinator
    try {
      const result = await components.generationCoordinator.generate({
        jobId: "e2e-val",
        intent: "Test",
        constraints: [],
        projectId: "e2e-project",
      });
      if (result.session) passed.push("generation-coordinator");
      else {
        failed.push("generation-coordinator");
        errors.push("No session");
      }
    } catch (e) {
      failed.push("generation-coordinator");
      errors.push(String(e));
    }

    // 3. Generation engine
    try {
      const result = await components.generationEngine.generate({
        name: "E2E Test",
        genre: "test",
        mechanics: ["jump"],
      });
      if (result.model) passed.push("generation-engine");
      else {
        failed.push("generation-engine");
        errors.push("No model");
      }
    } catch (e) {
      failed.push("generation-engine");
      errors.push(String(e));
    }

    // 4. Lua generation
    try {
      const model = createEmptyModel({
        title: "E2E",
        genre: "test",
        description: "",
        targetAudience: "all",
        mechanics: [],
        maxPlayers: 4,
      });
      model.scripts.push({
        id: "s1",
        name: "Test",
        path: "Test.lua",
        scriptType: "server",
        content: "print(1)\n",
        dependencies: [],
        generatedBy: "e2e",
      });
      const result = components.luaEngine.generate(model);
      if (result.files.length > 0) passed.push("lua-generation");
      else {
        failed.push("lua-generation");
        errors.push("No files");
      }
    } catch (e) {
      failed.push("lua-generation");
      errors.push(String(e));
    }

    // 5. Asset generation
    try {
      const model = createEmptyModel({
        title: "E2E",
        genre: "test",
        description: "",
        targetAudience: "all",
        mechanics: [],
        maxPlayers: 4,
      });
      const result = components.assetEngine.generate(model);
      if (result.manifest) passed.push("asset-generation");
      else {
        failed.push("asset-generation");
        errors.push("No manifest");
      }
    } catch (e) {
      failed.push("asset-generation");
      errors.push(String(e));
    }

    // 6. UI generation
    try {
      const model = createEmptyModel({
        title: "E2E",
        genre: "test",
        description: "",
        targetAudience: "all",
        mechanics: [],
        maxPlayers: 4,
      });
      const result = components.uiEngine.generate(model);
      if (result.screens.length > 0) passed.push("ui-generation");
      else {
        failed.push("ui-generation");
        errors.push("No screens");
      }
    } catch (e) {
      failed.push("ui-generation");
      errors.push(String(e));
    }

    // 7. Provider layer
    try {
      const available = components.providerRegistry.getAvailable();
      if (available.length > 0) passed.push("provider-layer");
      else {
        failed.push("provider-layer");
        errors.push("No providers");
      }
    } catch (e) {
      failed.push("provider-layer");
      errors.push(String(e));
    }

    // 8. Memory system
    try {
      const entry = components.memoryManager.store(
        "e2e",
        "validation",
        "e2e-test",
        { validated: true },
        "e2e-validator",
      );
      if (entry.id) passed.push("memory-system");
      else {
        failed.push("memory-system");
        errors.push("No entry ID");
      }
      components.memoryManager.delete(entry.id);
    } catch (e) {
      failed.push("memory-system");
      errors.push(String(e));
    }

    return {
      valid: failed.length === 0,
      stagesValidated: passed,
      stagesFailed: failed,
      totalDurationMs: Date.now() - start,
      errors,
      timestamp: Date.now(),
    };
  }
}
