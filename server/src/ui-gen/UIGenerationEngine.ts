/**
 * UIGenerationEngine.ts — Generates UI screens from GenerationModel.
 */

import type { GenerationModel } from "../generation/engine/GenerationModel";
import { UIHierarchyBuilder } from "./UIHierarchyBuilder";
import { UIValidationService } from "./UIValidationService";
import type {
  UIScreen,
  UIValidationReport,
  UIGenerationMetrics,
} from "./types";

export interface UIGenerationResult {
  success: boolean;
  screens: UIScreen[];
  validation: UIValidationReport;
  metrics: UIGenerationMetrics;
}

export class UIGenerationEngine {
  private hierarchyBuilder = new UIHierarchyBuilder();
  private validator = new UIValidationService();

  generate(model: GenerationModel): UIGenerationResult {
    const start = Date.now();
    const screens: UIScreen[] = [];

    // Main menu
    const menuButtons = ["Play", "Settings", "Shop"];
    if (model.game.mechanics.length > 0) menuButtons.push("Tutorial");
    screens.push(
      this.hierarchyBuilder.buildMenuScreen(
        "MainMenu",
        model.game.title,
        menuButtons,
      ),
    );

    // HUD
    const hudElements: Array<{ name: string; type: "label" | "bar" }> = [
      { name: "Score", type: "label" },
    ];
    if (
      model.game.mechanics.some(
        (m) => m.includes("combat") || m.includes("health"),
      )
    ) {
      hudElements.push({ name: "HealthBar", type: "bar" });
    }
    if (model.game.mechanics.some((m) => m.includes("collect"))) {
      hudElements.push({ name: "Coins", type: "label" });
    }
    screens.push(this.hierarchyBuilder.buildHUDScreen("GameHUD", hudElements));

    // Settings screen
    screens.push(
      this.hierarchyBuilder.buildMenuScreen("SettingsScreen", "Settings", [
        "Music",
        "SFX",
        "Graphics",
        "Back",
      ]),
    );

    const genDuration = Date.now() - start;

    // Validation
    const valStart = Date.now();
    const validation = this.validator.validate(screens);
    const valDuration = Date.now() - valStart;

    const totalObjects = screens.reduce((sum, s) => sum + s.objects.length, 0);

    return {
      success: validation.valid,
      screens,
      validation,
      metrics: {
        screensGenerated: screens.length,
        objectsGenerated: totalObjects,
        validationDurationMs: valDuration,
        generationDurationMs: genDuration,
        totalDurationMs: Date.now() - start,
      },
    };
  }
}
