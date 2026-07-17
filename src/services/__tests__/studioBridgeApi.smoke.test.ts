/**
 * Smoke / compilation test for studioBridgeApi.ts exports.
 *
 * These tests verify that the required interfaces are exported and that
 * conforming objects are assignable to their types. No runtime calls are
 * made — the value of these tests is purely at the TypeScript type level.
 *
 * Requirements: 6.5
 */

import { describe, it, expect } from "vitest";
import type {
  SyncChange,
  SyncStatus,
  ProjectSnapshot,
  ArtifactTransferResult,
} from "../studioBridgeApi";

describe("studioBridgeApi.ts — smoke / compilation tests (Requirement 6.5)", () => {
  it("SyncChange is assignable with all required fields", () => {
    const change: SyncChange = {
      changeId: "chg-001",
      artifactId: "art-001",
      artifactType: "lua",
      changeType: "update",
      content: { code: "print('hello')" },
      timestamp: Date.now(),
    };

    expect(change.changeId).toBe("chg-001");
    expect(change.artifactId).toBe("art-001");
    expect(change.artifactType).toBe("lua");
    expect(change.changeType).toBe("update");
    expect(change.timestamp).toBeTypeOf("number");
  });

  it("SyncChange accepts all valid changeType values", () => {
    const create: SyncChange = {
      changeId: "c1",
      artifactId: "a1",
      artifactType: "json",
      changeType: "create",
      content: {},
      timestamp: 1000,
    };
    const update: SyncChange = {
      changeId: "c2",
      artifactId: "a2",
      artifactType: "lua",
      changeType: "update",
      content: "code",
      timestamp: 2000,
    };
    const del: SyncChange = {
      changeId: "c3",
      artifactId: "a3",
      artifactType: "text",
      changeType: "delete",
      content: null,
      timestamp: 3000,
    };

    expect(create.changeType).toBe("create");
    expect(update.changeType).toBe("update");
    expect(del.changeType).toBe("delete");
  });

  it("SyncStatus is assignable with all required fields", () => {
    const status: SyncStatus = {
      lastSyncTimestamp: null,
      pendingChanges: 0,
      conflictCount: 0,
      currentVersion: "1.0.0-abc12345",
      projectId: null,
    };

    expect(status.pendingChanges).toBe(0);
    expect(status.conflictCount).toBe(0);
    expect(status.currentVersion).toBeTypeOf("string");
  });

  it("SyncStatus accepts non-null lastSyncTimestamp and projectId", () => {
    const status: SyncStatus = {
      lastSyncTimestamp: Date.now(),
      pendingChanges: 3,
      conflictCount: 1,
      currentVersion: "1.0.0-deadbeef",
      projectId: "proj-999",
    };

    expect(status.lastSyncTimestamp).toBeTypeOf("number");
    expect(status.projectId).toBe("proj-999");
  });

  it("ProjectSnapshot is assignable with all required fields", () => {
    const snapshot: ProjectSnapshot = {
      projectId: "proj-001",
      version: "1.0.0-cafebabe",
      artifacts: [
        {
          id: "art-001",
          type: "lua",
          name: "main.lua",
          stage: "generation",
          size: 512,
          hash: "abcdef1234567890",
          version: 1,
          createdAt: 1700000000000,
          reviewStatus: "pending",
        },
      ],
      generatedAt: 1700000001000,
      artifactCount: 1,
    };

    expect(snapshot.projectId).toBe("proj-001");
    expect(snapshot.artifacts).toHaveLength(1);
    expect(snapshot.artifactCount).toBe(1);
  });

  it("ProjectSnapshot is assignable with an empty artifact list", () => {
    const snapshot: ProjectSnapshot = {
      projectId: "proj-empty",
      version: "1.0.0-00000000",
      artifacts: [],
      generatedAt: Date.now(),
      artifactCount: 0,
    };

    expect(snapshot.artifacts).toHaveLength(0);
    expect(snapshot.artifactCount).toBe(0);
  });

  it("ArtifactTransferResult is assignable with all required fields", () => {
    const result: ArtifactTransferResult = {
      artifacts: [
        {
          id: "art-001",
          type: "lua",
          name: "main.lua",
          stage: "generation",
          size: 256,
          createdAt: 1700000000000,
          reviewStatus: "approved",
          content: "print('world')",
        },
      ],
      missing: [],
      totalSize: 256,
      payloadExceeded: false,
    };

    expect(result.artifacts).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
    expect(result.payloadExceeded).toBe(false);
  });

  it("ArtifactTransferResult is assignable when payload is exceeded", () => {
    const result: ArtifactTransferResult = {
      artifacts: [],
      missing: ["art-big-1", "art-big-2"],
      totalSize: 0,
      payloadExceeded: true,
    };

    expect(result.payloadExceeded).toBe(true);
    expect(result.missing).toContain("art-big-1");
  });
});
