/**
 * ManifestBuilder.ts — Builds the generation manifest from model state.
 */

import type { GenerationModel } from "../GenerationModel";

export interface GenerationManifestV2 {
  version: string;
  modelId: string;
  generatedAt: number;
  game: { title: string; genre: string };
  counts: {
    scripts: number;
    modules: number;
    services: number;
    folders: number;
    assets: number;
    ui: number;
  };
  generators: string[];
  totalSizeEstimate: number;
}

export class ManifestBuilder {
  build(model: GenerationModel, generators: string[]): GenerationManifestV2 {
    const scriptSize = model.scripts.reduce(
      (sum, s) => sum + s.content.length * 2,
      0,
    );
    return {
      version: "2.3.0",
      modelId: model.id,
      generatedAt: Date.now(),
      game: { title: model.game.title, genre: model.game.genre },
      counts: {
        scripts: model.scripts.length,
        modules: model.modules.length,
        services: model.services.length,
        folders: model.folders.length,
        assets: model.assets.length,
        ui: model.ui.length,
      },
      generators,
      totalSizeEstimate: scriptSize,
    };
  }
}
