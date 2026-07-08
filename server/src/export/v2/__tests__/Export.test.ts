import { describe, it, expect } from "vitest";
import { ExportManager, ExportValidator } from "../ExportManager";
import { ManifestBuilder } from "../../../studio/v2/manifest/ProjectManifest";

describe("ExportValidator", () => {
  const validator = new ExportValidator();

  it("passes valid manifest", () => {
    const manifest = new ManifestBuilder("p1", "Game")
      .addScript("Main", "Server/Main.lua", "server")
      .addFolder("Server")
      .build();
    expect(validator.validate(manifest).valid).toBe(true);
  });

  it("fails on empty scripts", () => {
    const manifest = new ManifestBuilder("p1", "Game")
      .addFolder("Server")
      .build();
    const result = validator.validate(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("No scripts in manifest");
  });
});

describe("ExportManager", () => {
  it("prepares a valid export", () => {
    const manager = new ExportManager();
    const manifest = new ManifestBuilder("p1", "Game")
      .addScript("A", "a.lua", "server")
      .addFolder("F")
      .build();
    const pkg = manager.prepare(manifest);
    expect(pkg.status).toBe("ready");
    expect(pkg.exportId).toMatch(/^export-/);
  });

  it("rejects invalid manifest", () => {
    const manager = new ExportManager();
    const manifest = new ManifestBuilder("p1", "Game").build(); // no scripts, no folders
    const pkg = manager.prepare(manifest);
    expect(pkg.status).toBe("failed");
    expect(pkg.validationErrors.length).toBeGreaterThan(0);
  });

  it("marks export completed", () => {
    const manager = new ExportManager();
    const manifest = new ManifestBuilder("p1", "G")
      .addScript("A", "a.lua", "server")
      .addFolder("F")
      .build();
    const pkg = manager.prepare(manifest);
    manager.complete(pkg.exportId);
    expect(manager.get(pkg.exportId)!.status).toBe("completed");
  });
});
