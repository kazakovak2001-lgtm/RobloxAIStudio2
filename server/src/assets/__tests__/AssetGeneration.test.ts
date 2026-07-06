/**
 * Asset Generation Tests (v2.6)
 */

import { describe, it, expect } from "vitest";
import { AssetGenerationEngine } from "../AssetGenerationEngine";
import { AssetRegistry } from "../AssetRegistry";
import { AssetValidationService } from "../AssetValidationService";
import { AssetManifestBuilder } from "../AssetManifestBuilder";
import { createEmptyModel } from "../../generation/engine/GenerationModel";
import { createAssetId } from "../types";

describe("AssetGenerationEngine", () => {
  it("generates assets from model", () => {
    const engine = new AssetGenerationEngine();
    const model = createEmptyModel({
      title: "Test",
      genre: "obby",
      description: "",
      targetAudience: "all",
      mechanics: ["collect"],
      maxPlayers: 10,
    });
    model.assets = [
      {
        id: "a1",
        name: "Map1",
        assetType: "model",
        path: "Workspace/Map1",
        metadata: {},
      },
    ];
    const result = engine.generate(model);
    expect(result.success).toBe(true);
    expect(result.manifest.totalAssets).toBeGreaterThan(2);
  });

  it("generates collectible SFX for collection mechanic", () => {
    const engine = new AssetGenerationEngine();
    const model = createEmptyModel({
      title: "Collector",
      genre: "test",
      description: "",
      targetAudience: "all",
      mechanics: ["collecting"],
      maxPlayers: 4,
    });
    const result = engine.generate(model);
    expect(
      result.manifest.assets.some((a) => a.name === "CollectibleSFX"),
    ).toBe(true);
  });
});

describe("AssetRegistry", () => {
  it("registers and retrieves assets", () => {
    const registry = new AssetRegistry();
    const result = registry.register({
      id: createAssetId(),
      name: "X",
      assetType: "model",
      path: "a/b",
      category: "model",
      dependencies: [],
      metadata: {},
      generatedBy: "test",
      timestamp: Date.now(),
    });
    expect(result.accepted).toBe(true);
    expect(registry.size).toBe(1);
  });

  it("rejects duplicate paths", () => {
    const registry = new AssetRegistry();
    registry.register({
      id: "a1",
      name: "X",
      assetType: "model",
      path: "same/path",
      category: "model",
      dependencies: [],
      metadata: {},
      generatedBy: "test",
      timestamp: Date.now(),
    });
    const result = registry.register({
      id: "a2",
      name: "Y",
      assetType: "model",
      path: "same/path",
      category: "model",
      dependencies: [],
      metadata: {},
      generatedBy: "test",
      timestamp: Date.now(),
    });
    expect(result.accepted).toBe(false);
  });
});

describe("AssetValidationService", () => {
  it("passes valid registry", () => {
    const registry = new AssetRegistry();
    registry.register({
      id: "a1",
      name: "Test",
      assetType: "texture",
      path: "tex/a.png",
      category: "ui",
      dependencies: [],
      metadata: {},
      generatedBy: "t",
      timestamp: Date.now(),
    });
    const validator = new AssetValidationService();
    expect(validator.validate(registry).valid).toBe(true);
  });

  it("reports unresolved references", () => {
    const registry = new AssetRegistry();
    registry.register({
      id: "a1",
      name: "Test",
      assetType: "model",
      path: "m/a",
      category: "model",
      dependencies: ["nonexistent"],
      metadata: {},
      generatedBy: "t",
      timestamp: Date.now(),
    });
    const validator = new AssetValidationService();
    const report = validator.validate(registry);
    expect(report.unresolvedRefs.length).toBeGreaterThan(0);
  });
});

describe("AssetManifestBuilder", () => {
  it("builds manifest with categories", () => {
    const registry = new AssetRegistry();
    registry.register({
      id: "a1",
      name: "X",
      assetType: "model",
      path: "a",
      category: "model",
      dependencies: [],
      metadata: {},
      generatedBy: "t",
      timestamp: Date.now(),
    });
    registry.register({
      id: "a2",
      name: "Y",
      assetType: "texture",
      path: "b",
      category: "ui",
      dependencies: [],
      metadata: {},
      generatedBy: "t",
      timestamp: Date.now(),
    });
    const builder = new AssetManifestBuilder();
    const manifest = builder.build(registry);
    expect(manifest.totalAssets).toBe(2);
    expect(manifest.categories["model"]).toBe(1);
    expect(manifest.categories["ui"]).toBe(1);
  });
});
