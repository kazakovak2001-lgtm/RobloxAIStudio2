/**
 * Unit tests for ProjectSyncManager
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ArtifactStore } from "../../../../pipeline/v2/ArtifactStore";
import { ProjectSyncManager } from "../ProjectSyncManager";
import type { SyncChange } from "../SyncTypes";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Seed one artifact into the store and return it. */
function seedArtifact(
  store: ArtifactStore,
  pipelineId: string,
  content: unknown = { value: "data" },
) {
  return store.store(pipelineId, "LUA_GENERATION", "test-agent", content);
}

/** Build a minimal valid SyncChange. */
function makeChange(overrides: Partial<SyncChange> = {}): SyncChange {
  return {
    changeId: "change-1",
    artifactId: "artifact-1",
    artifactType: "lua",
    changeType: "update",
    content: "print('updated')",
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ProjectSyncManager", () => {
  let store: ArtifactStore;
  let manager: ProjectSyncManager;

  beforeEach(() => {
    store = new ArtifactStore();
    manager = new ProjectSyncManager(store);
  });

  // ── getProjectSnapshot ────────────────────────────────────────────────────

  describe("getProjectSnapshot()", () => {
    // Requirements 1.4 — empty pipeline returns valid snapshot with empty artifact list
    it("returns a valid snapshot with an empty artifact list for an empty pipeline", () => {
      const pipelineId = "empty-pipeline";

      const snapshot = manager.getProjectSnapshot(pipelineId);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.projectId).toBe(pipelineId);
      expect(snapshot!.artifacts).toHaveLength(0);
      expect(snapshot!.artifactCount).toBe(0);
      expect(snapshot!.version).toBeTruthy();
      expect(snapshot!.generatedAt).toBeGreaterThan(0);
    });

    // Requirements 1.1 — artifacts match what is in the store
    it("includes an ArtifactRef for each artifact in the store", () => {
      const pipelineId = "pipe-with-artifacts";
      const a1 = seedArtifact(store, pipelineId, { script: "a" });
      const a2 = store.store(pipelineId, "DOCUMENTATION", null, {
        text: "docs",
      });

      const snapshot = manager.getProjectSnapshot(pipelineId);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.artifacts).toHaveLength(2);
      expect(snapshot!.artifactCount).toBe(2);

      const ids = snapshot!.artifacts.map((r) => r.id);
      expect(ids).toContain(a1.id);
      expect(ids).toContain(a2.id);
    });

    // Requirements 1.1 — ArtifactRef metadata matches stored artifact
    it("returns ArtifactRefs with metadata matching the stored artifact", () => {
      const pipelineId = "pipe-metadata";
      const stored = seedArtifact(store, pipelineId, {
        key: "metadata-check",
      });

      const snapshot = manager.getProjectSnapshot(pipelineId);
      const ref = snapshot!.artifacts[0];

      expect(ref.id).toBe(stored.id);
      expect(ref.type).toBe(stored.type);
      expect(ref.name).toBe(stored.name);
      expect(ref.stage).toBe(stored.stage);
      expect(ref.size).toBe(stored.sizeBytes);
      expect(ref.createdAt).toBe(stored.createdAt);
    });

    // Requirements 1.3 — version is a non-empty string
    it("includes a non-empty version string in the snapshot", () => {
      const snapshot = manager.getProjectSnapshot("any-pipeline");

      expect(typeof snapshot!.version).toBe("string");
      expect(snapshot!.version.length).toBeGreaterThan(0);
    });
  });

  // ── getSyncStatus — sentinel version ─────────────────────────────────────

  describe("getSyncStatus()", () => {
    // Requirements 3.4 / design note — sentinel "0.0.0" when no snapshot
    it('returns currentVersion "0.0.0" when no snapshot has been computed', () => {
      const status = manager.getSyncStatus("never-synced-pipeline");

      expect(status.currentVersion).toBe("0.0.0");
    });

    it('returns currentVersion "0.0.0" when called with no pipelineId', () => {
      const status = manager.getSyncStatus();

      expect(status.currentVersion).toBe("0.0.0");
    });

    it("returns the stored version after a snapshot has been computed", () => {
      const pipelineId = "pipe-version";
      manager.getProjectSnapshot(pipelineId);

      const status = manager.getSyncStatus(pipelineId);

      expect(status.currentVersion).not.toBe("0.0.0");
      expect(status.currentVersion).toMatch(/^1\.0\.0-/);
    });

    it("includes the correct projectId in the status", () => {
      const pipelineId = "specific-project";
      const status = manager.getSyncStatus(pipelineId);

      expect(status.projectId).toBe(pipelineId);
    });

    it("returns projectId: null when called without an argument", () => {
      const status = manager.getSyncStatus();

      expect(status.projectId).toBeNull();
    });
  });

  // ── processSyncRequest — zero changes ─────────────────────────────────────

  describe("processSyncRequest() — zero changes", () => {
    // Requirements 3.4
    it('returns status "no_changes" when the changes array is empty', () => {
      const pipelineId = "pipe-zero";
      seedArtifact(store, pipelineId);

      const result = manager.processSyncRequest(pipelineId, []);

      expect(result.status).toBe("no_changes");
      expect(result.appliedChanges).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it("includes the current version in the result when there are no changes", () => {
      const pipelineId = "pipe-zero-version";
      manager.getProjectSnapshot(pipelineId); // prime version

      const result = manager.processSyncRequest(pipelineId, []);

      expect(result.newVersion).toBeTruthy();
      expect(typeof result.newVersion).toBe("string");
    });
  });

  // ── processSyncRequest — applied ──────────────────────────────────────────

  describe("processSyncRequest() — valid non-conflicting changes", () => {
    // Requirements 3.1, 3.2
    it('returns status "applied" for a valid update change with no conflict', () => {
      const pipelineId = "pipe-applied";
      const artifact = seedArtifact(store, pipelineId, { original: true });

      // timestamp is well after artifact.createdAt → no conflict
      const change = makeChange({
        changeId: "c-apply-1",
        artifactId: artifact.id,
        changeType: "update",
        content: { updated: true },
        timestamp: artifact.createdAt + 10_000,
      });

      const result = manager.processSyncRequest(pipelineId, [change]);

      expect(result.status).toBe("applied");
      expect(result.appliedChanges).toContain("c-apply-1");
      expect(result.conflicts).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    // Requirements 3.2, 3.5 — new version is set after successful apply
    it("sets a new version after applying changes", () => {
      const pipelineId = "pipe-version-update";
      const artifact = seedArtifact(store, pipelineId);
      manager.getProjectSnapshot(pipelineId); // record baseline version
      const beforeVersion = manager.getSyncStatus(pipelineId).currentVersion;

      const change = makeChange({
        changeId: "c-ver",
        artifactId: artifact.id,
        changeType: "update",
        content: { new: "content" },
        timestamp: artifact.createdAt + 5_000,
      });

      manager.processSyncRequest(pipelineId, [change]);

      const afterVersion = manager.getSyncStatus(pipelineId).currentVersion;
      expect(afterVersion).not.toBe(beforeVersion);
      expect(afterVersion).toMatch(/^1\.0\.0-/);
    });

    // Requirements 3.2 — all change IDs in appliedChanges
    it("lists all change IDs in appliedChanges for multiple non-conflicting changes", () => {
      const pipelineId = "pipe-multi-apply";
      const a1 = seedArtifact(store, pipelineId, { n: 1 });
      const a2 = store.store(pipelineId, "DOCUMENTATION", null, { n: 2 });
      const now = Date.now() + 10_000;

      const changes = [
        makeChange({
          changeId: "c-multi-1",
          artifactId: a1.id,
          changeType: "update",
          content: { updated: 1 },
          timestamp: now,
        }),
        makeChange({
          changeId: "c-multi-2",
          artifactId: a2.id,
          changeType: "update",
          content: { updated: 2 },
          timestamp: now,
        }),
      ];

      const result = manager.processSyncRequest(pipelineId, changes);

      expect(result.status).toBe("applied");
      expect(result.appliedChanges).toContain("c-multi-1");
      expect(result.appliedChanges).toContain("c-multi-2");
      expect(result.appliedChanges).toHaveLength(2);
    });
  });

  // ── processSyncRequest — conflict ─────────────────────────────────────────

  describe("processSyncRequest() — conflict detection", () => {
    // Requirements 3.3 — artifact.createdAt > change.timestamp triggers conflict
    it('returns status "conflict" when artifact was modified after the change timestamp', () => {
      const pipelineId = "pipe-conflict";
      const artifact = seedArtifact(store, pipelineId, { original: true });

      // timestamp is BEFORE artifact.createdAt → conflict
      const change = makeChange({
        changeId: "c-conflict-1",
        artifactId: artifact.id,
        changeType: "update",
        content: { stale: true },
        timestamp: artifact.createdAt - 5_000,
      });

      const result = manager.processSyncRequest(pipelineId, [change]);

      expect(result.status).toBe("conflict");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].changeId).toBe("c-conflict-1");
      expect(result.appliedChanges).toHaveLength(0);
    });

    // Requirements 3.3 — delete also triggers conflict when artifact is newer
    it('returns status "conflict" for a "delete" change with stale timestamp', () => {
      const pipelineId = "pipe-conflict-delete";
      const artifact = seedArtifact(store, pipelineId);

      const change = makeChange({
        changeId: "c-conflict-delete",
        artifactId: artifact.id,
        changeType: "delete",
        content: null,
        timestamp: artifact.createdAt - 1_000,
      });

      const result = manager.processSyncRequest(pipelineId, [change]);

      expect(result.status).toBe("conflict");
      expect(
        result.conflicts.some((c) => c.changeId === "c-conflict-delete"),
      ).toBe(true);
    });

    // Conflict entry has correct fields
    it("populates conflict fields with localVersion and remoteVersion", () => {
      const pipelineId = "pipe-conflict-fields";
      const artifact = seedArtifact(store, pipelineId);
      const staleTimestamp = artifact.createdAt - 2_000;

      const change = makeChange({
        changeId: "c-fields",
        artifactId: artifact.id,
        changeType: "update",
        content: "stale",
        timestamp: staleTimestamp,
      });

      const result = manager.processSyncRequest(pipelineId, [change]);
      const conflict = result.conflicts[0];

      expect(conflict.artifactId).toBe(artifact.id);
      expect(conflict.localVersion).toBe(String(artifact.createdAt));
      expect(conflict.remoteVersion).toBe(String(staleTimestamp));
      expect(typeof conflict.reason).toBe("string");
      expect(conflict.reason.length).toBeGreaterThan(0);
    });
  });

  // ── processSyncRequest — mixed changes ────────────────────────────────────

  describe("processSyncRequest() — mixed conflicting and non-conflicting changes", () => {
    // Requirements 3.1, 3.2, 3.3 — some applied, some conflict
    it("separates clean changes into appliedChanges and conflicting ones into conflicts", () => {
      const pipelineId = "pipe-mixed";
      const freshArtifact = seedArtifact(store, pipelineId, { fresh: true });
      const staleArtifact = store.store(pipelineId, "DOCUMENTATION", null, {
        stale: true,
      });

      const cleanChange = makeChange({
        changeId: "c-clean",
        artifactId: freshArtifact.id,
        changeType: "update",
        content: { updated: true },
        // timestamp well after creation → no conflict
        timestamp: freshArtifact.createdAt + 10_000,
      });

      const conflictingChange = makeChange({
        changeId: "c-stale",
        artifactId: staleArtifact.id,
        changeType: "update",
        content: { stale: "edit" },
        // timestamp before artifact creation → conflict
        timestamp: staleArtifact.createdAt - 1_000,
      });

      const result = manager.processSyncRequest(pipelineId, [
        cleanChange,
        conflictingChange,
      ]);

      // Overall status is "conflict" because at least one conflict exists
      expect(result.status).toBe("conflict");

      // Clean change was still applied
      expect(result.appliedChanges).toContain("c-clean");
      expect(result.appliedChanges).not.toContain("c-stale");

      // Conflicting change recorded
      expect(result.conflicts.some((c) => c.changeId === "c-stale")).toBe(true);
      expect(result.conflicts.some((c) => c.changeId === "c-clean")).toBe(
        false,
      );
    });

    // create changes are not conflicting (only update/delete can conflict)
    it("does not mark 'create' changes as conflicting even with an old timestamp", () => {
      const pipelineId = "pipe-create-no-conflict";
      seedArtifact(store, pipelineId); // give the pipeline something

      const createChange = makeChange({
        changeId: "c-create",
        changeType: "create",
        artifactId: "brand-new-id",
        artifactType: "lua",
        content: "-- new script",
        timestamp: 1, // extremely old timestamp — create should never conflict
      });

      const result = manager.processSyncRequest(pipelineId, [createChange]);

      // Should not appear in conflicts
      expect(result.conflicts.some((c) => c.changeId === "c-create")).toBe(
        false,
      );
    });
  });

  // ── validateOnly — no mutation ────────────────────────────────────────────

  describe("validateOnly() — does not mutate the store", () => {
    // Requirements 4.1
    it("leaves the artifact count unchanged after validateOnly", () => {
      const pipelineId = "pipe-validate-only";
      const artifact = seedArtifact(store, pipelineId);
      const countBefore = store.count;

      const change = makeChange({
        changeId: "c-validate",
        artifactId: artifact.id,
        changeType: "update",
        content: { should: "not apply" },
        timestamp: artifact.createdAt + 5_000,
      });

      manager.validateOnly(pipelineId, [change]);

      expect(store.count).toBe(countBefore);
    });

    it("does not alter artifact content after validateOnly", () => {
      const pipelineId = "pipe-validate-content";
      const originalContent = { unchanged: true };
      const artifact = seedArtifact(store, pipelineId, originalContent);

      const change = makeChange({
        changeId: "c-validate-content",
        artifactId: artifact.id,
        changeType: "update",
        content: { changed: true },
        timestamp: artifact.createdAt + 5_000,
      });

      manager.validateOnly(pipelineId, [change]);

      const storedArtifact = store.getById(artifact.id);
      expect(storedArtifact!.content).toEqual(originalContent);
    });

    it("returns a ValidationResult with valid: true for a valid change", () => {
      const pipelineId = "pipe-validate-result";
      const artifact = seedArtifact(store, pipelineId);

      const change = makeChange({
        changeId: "c-valid",
        artifactId: artifact.id,
        changeType: "update",
        content: "valid content",
        timestamp: artifact.createdAt + 1_000,
      });

      const result = manager.validateOnly(pipelineId, [change]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.validatedCount).toBe(1);
    });

    it("returns validation errors without applying changes for invalid changes", () => {
      const pipelineId = "pipe-validate-invalid";
      seedArtifact(store, pipelineId);
      const countBefore = store.count;

      const invalidChange = makeChange({
        changeId: "c-invalid",
        changeType: "update",
        artifactId: "non-existent-id",
        content: "data",
        timestamp: Date.now(),
      });

      const result = manager.validateOnly(pipelineId, [invalidChange]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Store must not have changed
      expect(store.count).toBe(countBefore);
    });

    it("does not change project version after validateOnly", () => {
      const pipelineId = "pipe-validate-version";
      const artifact = seedArtifact(store, pipelineId);
      manager.getProjectSnapshot(pipelineId);
      const versionBefore = manager.getSyncStatus(pipelineId).currentVersion;

      const change = makeChange({
        changeId: "c-val-ver",
        artifactId: artifact.id,
        changeType: "update",
        content: { new: "data" },
        timestamp: artifact.createdAt + 1_000,
      });

      manager.validateOnly(pipelineId, [change]);

      expect(manager.getSyncStatus(pipelineId).currentVersion).toBe(
        versionBefore,
      );
    });
  });
});
