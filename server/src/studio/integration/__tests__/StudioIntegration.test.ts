/**
 * Studio Integration Tests (v2.4)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  StudioIntegrationManager,
  type StudioEvent,
} from "../StudioIntegrationManager";
import { StudioConnectionRegistry } from "../StudioConnectionRegistry";
import { StudioImportValidator } from "../StudioImportValidator";
import { ProjectDiffEngine } from "../ProjectDiffEngine";
import { StudioSyncMetrics } from "../StudioSyncMetrics";
import type { GenerationPackage } from "../../../generation/coordinator/types";

function createMockPackage(
  overrides?: Partial<GenerationPackage>,
): GenerationPackage {
  return {
    packageId: "pkg-test-123",
    sessionId: "gen-test",
    projectId: "proj-1",
    blueprint: { title: "Test Game" },
    executionPlan: { stages: ["plan", "exec"] },
    scripts: [
      {
        id: "s1",
        type: "lua-script",
        path: "ServerScriptService/Main.lua",
        content: "print('hi')",
        size: 20,
        generatedBy: "test",
        timestamp: Date.now(),
      },
    ],
    configs: [
      {
        id: "c1",
        type: "config",
        path: "ReplicatedStorage/Config/Game.lua",
        content: { title: "Test" },
        size: 30,
        generatedBy: "test",
        timestamp: Date.now(),
      },
    ],
    metadata: {
      generationId: "gen-1",
      blueprintVersion: "1.0.0",
      plannerVersion: "1.0.0",
      agentVersions: {},
      artifactVersions: {},
      executionTimestamps: {},
      validationResults: {},
    },
    validationReport: {
      valid: true,
      stagesExecuted: 4,
      stagesExpected: 4,
      artifactsGenerated: 2,
      missingDependencies: [],
      duplicatedOutputs: [],
      unresolvedReferences: [],
      structureValid: true,
    },
    totalArtifacts: 2,
    totalSizeBytes: 50,
    generatedAt: Date.now(),
    ...overrides,
  };
}

describe("StudioConnectionRegistry", () => {
  let registry: StudioConnectionRegistry;
  beforeEach(() => {
    registry = new StudioConnectionRegistry();
  });

  it("connects and tracks sessions", () => {
    const session = registry.connect("studio-1", "proj-1");
    expect(session.studioId).toBe("studio-1");
    expect(session.status).toBe("idle");
    expect(registry.size).toBe(1);
  });

  it("handles heartbeat", () => {
    registry.connect("studio-1", "proj-1");
    expect(registry.heartbeat("studio-1")).toBe(true);
    expect(registry.isAlive("studio-1")).toBe(true);
  });

  it("disconnects cleanly", () => {
    registry.connect("studio-1", "proj-1");
    registry.disconnect("studio-1");
    expect(registry.size).toBe(0);
    expect(registry.getSession("studio-1")).toBeNull();
  });

  it("returns null for unknown sessions", () => {
    expect(registry.getSession("unknown")).toBeNull();
    expect(registry.heartbeat("unknown")).toBe(false);
  });
});

describe("StudioImportValidator", () => {
  const validator = new StudioImportValidator();

  it("passes valid package", () => {
    const result = validator.validate(createMockPackage());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails on empty artifacts", () => {
    const result = validator.validate(
      createMockPackage({ totalArtifacts: 0, scripts: [], configs: [] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("no artifacts"))).toBe(true);
  });

  it("fails on missing package ID", () => {
    const result = validator.validate(createMockPackage({ packageId: "" }));
    expect(result.valid).toBe(false);
  });

  it("detects duplicate paths", () => {
    const pkg = createMockPackage();
    pkg.scripts.push({ ...pkg.scripts[0], id: "s2" });
    const result = validator.validate(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });
});

describe("ProjectDiffEngine", () => {
  const engine = new ProjectDiffEngine();

  it("detects all items as added on first sync", () => {
    const pkg = createMockPackage();
    const diff = engine.computeDiff(null, pkg);
    expect(diff.added.length).toBeGreaterThan(0);
    expect(diff.modified).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it("detects no changes on same package", () => {
    const pkg = createMockPackage();
    const hashMap = engine.buildHashMap(pkg);
    const diff = engine.computeDiff(hashMap, pkg);
    expect(diff.totalChanges).toBe(0);
    expect(diff.unchanged).toBeGreaterThan(0);
  });

  it("detects modifications", () => {
    const pkg1 = createMockPackage();
    const hashMap = engine.buildHashMap(pkg1);
    const pkg2 = createMockPackage();
    pkg2.scripts[0].content = "print('modified')";
    const diff = engine.computeDiff(hashMap, pkg2);
    expect(diff.modified.length).toBeGreaterThan(0);
  });
});

describe("StudioIntegrationManager", () => {
  let manager: StudioIntegrationManager;
  beforeEach(() => {
    manager = new StudioIntegrationManager();
  });

  it("connects and disconnects", () => {
    const session = manager.connect("studio-1", "proj-1");
    expect(session.studioId).toBe("studio-1");
    expect(manager.getConnectionCount()).toBe(1);
    manager.disconnect("studio-1");
    expect(manager.getConnectionCount()).toBe(0);
  });

  it("synchronizes a valid package", async () => {
    manager.connect("studio-1", "proj-1");
    const result = await manager.synchronize("studio-1", createMockPackage());
    expect(result.success).toBe(true);
    expect(result.itemsSynced).toBeGreaterThan(0);
  });

  it("fails sync for disconnected studio", async () => {
    const result = await manager.synchronize("unknown", createMockPackage());
    expect(result.success).toBe(false);
    expect(result.error).toContain("not connected");
  });

  it("fails sync for invalid package", async () => {
    manager.connect("studio-1", "proj-1");
    const result = await manager.synchronize(
      "studio-1",
      createMockPackage({
        packageId: "",
        totalArtifacts: 0,
        scripts: [],
        configs: [],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("emits events during sync", async () => {
    const events: StudioEvent[] = [];
    manager.on((e) => events.push(e));
    manager.connect("studio-1", "proj-1");
    await manager.synchronize("studio-1", createMockPackage());
    expect(events.some((e) => e.type === "StudioConnected")).toBe(true);
    expect(events.some((e) => e.type === "SyncStarted")).toBe(true);
    expect(events.some((e) => e.type === "SyncCompleted")).toBe(true);
  });

  it("tracks metrics", async () => {
    manager.connect("studio-1", "proj-1");
    await manager.synchronize("studio-1", createMockPackage());
    await manager.synchronize("studio-1", createMockPackage());
    const metrics = manager.getMetrics();
    expect(metrics.totalSyncs).toBe(2);
    expect(metrics.successRate).toBe(1);
  });

  it("supports repeated synchronization (incremental)", async () => {
    manager.connect("studio-1", "proj-1");
    await manager.synchronize("studio-1", createMockPackage());
    const result = await manager.synchronize("studio-1", createMockPackage());
    expect(result.success).toBe(true);
    expect(result.itemsSynced).toBe(0);
  });
});

describe("StudioSyncMetrics", () => {
  it("computes metrics from results", () => {
    const metrics = new StudioSyncMetrics();
    metrics.record({
      success: true,
      sessionId: "s1",
      payloadId: "p1",
      itemsSynced: 5,
      totalSize: 1000,
      durationMs: 50,
    });
    metrics.record({
      success: false,
      sessionId: "s1",
      payloadId: "p2",
      itemsSynced: 0,
      totalSize: 0,
      durationMs: 10,
      error: "fail",
    });
    const m = metrics.getMetrics();
    expect(m.totalSyncs).toBe(2);
    expect(m.successfulSyncs).toBe(1);
    expect(m.failedSyncs).toBe(1);
    expect(m.successRate).toBe(0.5);
  });
});
