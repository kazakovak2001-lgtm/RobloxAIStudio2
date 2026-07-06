/**
 * ModuleGenerator.ts — Generates shared ModuleScripts.
 */

import {
  BaseGenerator,
  type GeneratorInput,
  type GeneratorOutput,
  type GeneratorMetadata,
} from "../BaseGenerator";

export class ModuleGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "module-generator",
    name: "Module Generator",
    version: "1.0.0",
    dependencies: ["script-generator"],
    produces: ["modules"],
  };

  async generate(input: GeneratorInput): Promise<GeneratorOutput> {
    const start = Date.now();
    const { model } = input;
    const modifications: string[] = [];

    // Utility module
    model.modules.push({
      id: "mod-utils",
      name: "Utils",
      path: "ReplicatedStorage/Modules/Utils.lua",
      exports: ["Utils"],
      dependencies: [],
      generatedBy: this.metadata.id,
    });
    modifications.push("ReplicatedStorage/Modules/Utils.lua");

    // Constants module
    model.modules.push({
      id: "mod-constants",
      name: "Constants",
      path: "ReplicatedStorage/Modules/Constants.lua",
      exports: ["Constants"],
      dependencies: [],
      generatedBy: this.metadata.id,
    });
    modifications.push("ReplicatedStorage/Modules/Constants.lua");

    // Event bus module
    model.modules.push({
      id: "mod-eventbus",
      name: "EventBus",
      path: "ReplicatedStorage/Modules/EventBus.lua",
      exports: ["EventBus"],
      dependencies: [],
      generatedBy: this.metadata.id,
    });
    modifications.push("ReplicatedStorage/Modules/EventBus.lua");

    return {
      generatorId: this.metadata.id,
      success: true,
      modifications,
      durationMs: Date.now() - start,
    };
  }
}
