/**
 * Smoke test — verifies that the sync barrel (`index.ts`) compiles and re-exports
 * all expected symbols without type errors.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1
 */

import { describe, it, expect } from "vitest";

// Import concrete values from the barrel
import {
  ProjectSyncManager,
  ArtifactTransferManager,
  SyncValidator,
} from "../index";

// Import types — these are type-only imports; we verify them via typed variable
// assignments below (compile-time check) rather than runtime `typeof` checks.
import type {
  ProjectSnapshot,
  ArtifactRef,
  SyncChange,
  SyncChangeType,
  SyncConflict,
  SyncResult,
  SyncResultStatus,
  SyncStatus,
  TransferResult,
  ValidationResult,
} from "../index";

describe("sync barrel — exported classes are defined", () => {
  it("ProjectSyncManager is exported and is a constructor", () => {
    expect(ProjectSyncManager).toBeDefined();
    expect(typeof ProjectSyncManager).toBe("function");
  });

  it("ArtifactTransferManager is exported and is a constructor", () => {
    expect(ArtifactTransferManager).toBeDefined();
    expect(typeof ArtifactTransferManager).toBe("function");
  });

  it("SyncValidator is exported and is a constructor", () => {
    expect(SyncValidator).toBeDefined();
    expect(typeof SyncValidator).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Compile-time shape checks: the TypeScript compiler will reject this file if
// any of these type assignments are inconsistent with the barrel's exports.
// ---------------------------------------------------------------------------

describe("sync barrel — type exports are assignable (compile-time check)", () => {
  it("SyncChangeType union covers create | update | delete", () => {
    const create: SyncChangeType = "create";
    const update: SyncChangeType = "update";
    const del: SyncChangeType = "delete";
    expect(create).toBe("create");
    expect(update).toBe("update");
    expect(del).toBe("delete");
  });

  it("SyncResultStatus union covers all four values", () => {
    const applied: SyncResultStatus = "applied";
    const conflict: SyncResultStatus = "conflict";
    const noChanges: SyncResultStatus = "no_changes";
    const error: SyncResultStatus = "error";
    expect(applied).toBe("applied");
    expect(conflict).toBe("conflict");
    expect(noChanges).toBe("no_changes");
    expect(error).toBe("error");
  });

  it("ProjectSnapshot interface is assignable", () => {
    const snap: ProjectSnapshot = {
      projectId: "p-1",
      version: "1.0.0-abcd1234",
      artifacts: [],
      generatedAt: Date.now(),
      artifactCount: 0,
    };
    expect(snap.projectId).toBe("p-1");
  });

  it("ArtifactRef interface is assignable", () => {
    const ref: ArtifactRef = {
      id: "a-1",
      type: "lua",
      name: "Main",
      stage: "lua_generator",
      size: 128,
      hash: "deadbeef12345678",
      version: 1,
      createdAt: Date.now(),
      reviewStatus: "approved",
    };
    expect(ref.type).toBe("lua");
  });

  it("SyncChange interface is assignable", () => {
    const change: SyncChange = {
      changeId: "c-1",
      artifactId: "a-1",
      artifactType: "lua",
      changeType: "update",
      content: "print('hello')",
      timestamp: Date.now(),
    };
    expect(change.changeType).toBe("update");
  });

  it("SyncConflict interface is assignable", () => {
    const conflict: SyncConflict = {
      changeId: "c-1",
      artifactId: "a-1",
      reason: "Artifact was modified after change was created",
      localVersion: "1700000002000",
      remoteVersion: "1700000001000",
    };
    expect(conflict.reason).toContain("modified");
  });

  it("SyncResult interface is assignable", () => {
    const result: SyncResult = {
      status: "applied",
      appliedChanges: ["c-1"],
      conflicts: [],
      errors: [],
      newVersion: "1.0.0-cafe5678",
      timestamp: Date.now(),
    };
    expect(result.status).toBe("applied");
  });

  it("SyncStatus interface is assignable", () => {
    const status: SyncStatus = {
      lastSyncTimestamp: null,
      pendingChanges: 0,
      conflictCount: 0,
      currentVersion: "0.0.0",
      projectId: null,
    };
    expect(status.currentVersion).toBe("0.0.0");
  });

  it("TransferResult interface is assignable", () => {
    const result: TransferResult = {
      artifacts: [],
      missing: [],
      totalSize: 0,
      payloadExceeded: false,
    };
    expect(result.payloadExceeded).toBe(false);
  });

  it("ValidationResult interface is assignable", () => {
    const result: ValidationResult = {
      valid: true,
      validatedCount: 0,
      errors: [],
    };
    expect(result.valid).toBe(true);
  });
});
