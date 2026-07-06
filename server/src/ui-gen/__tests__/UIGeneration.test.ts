/**
 * UI Generation Tests (v2.6)
 */

import { describe, it, expect } from "vitest";
import { UIGenerationEngine } from "../UIGenerationEngine";
import { UIHierarchyBuilder } from "../UIHierarchyBuilder";
import { UIValidationService } from "../UIValidationService";
import { createEmptyModel } from "../../generation/engine/GenerationModel";

describe("UIGenerationEngine", () => {
  it("generates UI screens from model", () => {
    const engine = new UIGenerationEngine();
    const model = createEmptyModel({
      title: "Super Game",
      genre: "obby",
      description: "",
      targetAudience: "kids",
      mechanics: ["jump", "collect"],
      maxPlayers: 10,
    });
    const result = engine.generate(model);
    expect(result.success).toBe(true);
    expect(result.screens.length).toBeGreaterThanOrEqual(3);
    expect(result.metrics.objectsGenerated).toBeGreaterThan(5);
  });

  it("adds tutorial button when mechanics exist", () => {
    const engine = new UIGenerationEngine();
    const model = createEmptyModel({
      title: "T",
      genre: "t",
      description: "",
      targetAudience: "all",
      mechanics: ["combat"],
      maxPlayers: 4,
    });
    const result = engine.generate(model);
    const menu = result.screens.find((s) => s.name === "MainMenu");
    expect(menu?.objects.some((o) => o.name === "TutorialButton")).toBe(true);
  });

  it("adds health bar for combat mechanic", () => {
    const engine = new UIGenerationEngine();
    const model = createEmptyModel({
      title: "T",
      genre: "t",
      description: "",
      targetAudience: "all",
      mechanics: ["combat"],
      maxPlayers: 4,
    });
    const result = engine.generate(model);
    const hud = result.screens.find((s) => s.name === "GameHUD");
    expect(hud?.objects.some((o) => o.name === "HealthBar")).toBe(true);
  });
});

describe("UIHierarchyBuilder", () => {
  const builder = new UIHierarchyBuilder();

  it("builds menu screen with buttons", () => {
    const screen = builder.buildMenuScreen("TestMenu", "Hello", [
      "Play",
      "Quit",
    ]);
    expect(screen.rootObject.type).toBe("ScreenGui");
    expect(screen.objects.some((o) => o.name === "PlayButton")).toBe(true);
    expect(screen.objects.some((o) => o.name === "QuitButton")).toBe(true);
  });

  it("builds HUD with elements", () => {
    const screen = builder.buildHUDScreen("HUD", [
      { name: "Score", type: "label" },
      { name: "HP", type: "bar" },
    ]);
    expect(
      screen.objects.some((o) => o.name === "Score" && o.type === "TextLabel"),
    ).toBe(true);
    expect(
      screen.objects.some((o) => o.name === "HP" && o.type === "Frame"),
    ).toBe(true);
  });
});

describe("UIValidationService", () => {
  const validator = new UIValidationService();

  it("passes valid screens", () => {
    const engine = new UIGenerationEngine();
    const model = createEmptyModel({
      title: "Valid",
      genre: "t",
      description: "",
      targetAudience: "all",
      mechanics: [],
      maxPlayers: 4,
    });
    const result = engine.generate(model);
    const report = validator.validate(result.screens);
    expect(report.valid).toBe(true);
  });

  it("detects duplicate IDs", () => {
    const report = validator.validate([
      {
        id: "s1",
        name: "Bad",
        screenType: "menu",
        rootObject: {
          id: "r1",
          type: "ScreenGui",
          name: "Root",
          parent: null,
          properties: {},
          children: ["dup", "dup"],
        },
        objects: [
          {
            id: "r1",
            type: "ScreenGui",
            name: "Root",
            parent: null,
            properties: {},
            children: [],
          },
          {
            id: "dup",
            type: "Frame",
            name: "A",
            parent: "r1",
            properties: {},
            children: [],
          },
          {
            id: "dup",
            type: "Frame",
            name: "B",
            parent: "r1",
            properties: {},
            children: [],
          },
        ],
      },
    ]);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("detects invalid parent references", () => {
    const report = validator.validate([
      {
        id: "s1",
        name: "Bad",
        screenType: "menu",
        rootObject: {
          id: "r1",
          type: "ScreenGui",
          name: "Root",
          parent: null,
          properties: {},
          children: [],
        },
        objects: [
          {
            id: "r1",
            type: "ScreenGui",
            name: "Root",
            parent: null,
            properties: {},
            children: [],
          },
          {
            id: "c1",
            type: "Frame",
            name: "Child",
            parent: "nonexistent",
            properties: {},
            children: [],
          },
        ],
      },
    ]);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("missing parent"))).toBe(true);
  });
});
