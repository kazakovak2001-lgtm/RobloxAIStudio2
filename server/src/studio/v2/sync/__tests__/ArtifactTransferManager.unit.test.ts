/**
 * Unit tests for ArtifactTransferManager
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ArtifactStore } from "../../../../pipeline/v2/ArtifactStore";
import { ArtifactTransferManager } from "../ArtifactTransferManager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed the store with one artifact and return it. */
async function seedArtifact(
  store: ArtifactStore,
  pipelineId: string,
  content: unknown = { hello: "world" },
) {
  return await store.store(pipelineId, "LUA_GENERATION", "test-agent", content);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ArtifactTransferManager — transfer()", () => {
  let store: ArtifactStore;
  let manager: ArtifactTransferManager;

  beforeEach(() => {
    store = new ArtifactStore();
    manager = new ArtifactTransferManager(store);
  });

  // Requirement 2.1, 2.3 — empty list path
  it("returns empty artifacts array when given an empty ID list", () => {
    const result = manager.transfer([]);

    expect(result.artifacts).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.totalSize).toBe(0);
    expect(result.payloadExceeded).toBe(false);
  });

  // Requirement 2.1, 2.4 — single known artifact
  it("returns correct content and metadata for a single known artifact", async () => {
    const pipelineId = "pipe-single";
    const content = { script: "print('hello')", lineCount: 1 };
    const stored = await seedArtifact(store, pipelineId, content);

    const result = manager.transfer([stored.id]);

    expect(result.artifacts).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
    expect(result.payloadExceeded).toBe(false);

    const transferred = result.artifacts[0];
    expect(transferred.id).toBe(stored.id);
    expect(transferred.type).toBe(stored.type);
    expect(transferred.name).toBe(stored.name);
    expect(transferred.stage).toBe(stored.stage);
    expect(transferred.size).toBe(stored.sizeBytes);
    expect(transferred.createdAt).toBe(stored.createdAt);
    expect(transferred.reviewStatus).toBe(stored.reviewStatus);
    expect(transferred.content).toEqual(content);
  });

  // Requirement 2.2 — unknown ID in missing list
  it("places an unknown artifact ID in the missing list", () => {
    const unknownId = "does-not-exist-abc123";

    const result = manager.transfer([unknownId]);

    expect(result.artifacts).toHaveLength(0);
    expect(result.missing).toContain(unknownId);
    expect(result.missing).toHaveLength(1);
    expect(result.totalSize).toBe(0);
    expect(result.payloadExceeded).toBe(false);
  });

  // Requirement 2.1, 2.3, 2.4 — multiple known IDs all returned
  it("returns all known artifacts when multiple IDs are requested", async () => {
    const pipelineId = "pipe-multi";
    const a1 = await store.store(pipelineId, "LUA_GENERATION", null, {
      script: "a",
    });
    const a2 = await store.store(pipelineId, "DOCUMENTATION", null, {
      text: "docs",
    });
    const a3 = await store.store(pipelineId, "REQUIREMENTS", null, {
      items: [1, 2, 3],
    });

    const result = manager.transfer([a1.id, a2.id, a3.id]);

    expect(result.artifacts).toHaveLength(3);
    expect(result.missing).toHaveLength(0);
    expect(result.payloadExceeded).toBe(false);

    const returnedIds = result.artifacts.map((a) => a.id);
    expect(returnedIds).toContain(a1.id);
    expect(returnedIds).toContain(a2.id);
    expect(returnedIds).toContain(a3.id);
  });

  // Requirement 2.1, 2.2 — mix of known and unknown IDs
  it("correctly splits known and unknown IDs into artifacts and missing", async () => {
    const pipelineId = "pipe-mixed";
    const known1 = await store.store(pipelineId, "GAME_DESIGN", null, {
      genre: "RPG",
    });
    const known2 = await store.store(pipelineId, "ARCHITECTURE", null, {
      modules: 5,
    });
    const unknownId1 = "ghost-id-aaa";
    const unknownId2 = "ghost-id-bbb";

    const result = manager.transfer([
      known1.id,
      unknownId1,
      known2.id,
      unknownId2,
    ]);

    // Known artifacts are returned
    expect(result.artifacts).toHaveLength(2);
    const returnedIds = result.artifacts.map((a) => a.id);
    expect(returnedIds).toContain(known1.id);
    expect(returnedIds).toContain(known2.id);

    // Unknown IDs go to missing
    expect(result.missing).toHaveLength(2);
    expect(result.missing).toContain(unknownId1);
    expect(result.missing).toContain(unknownId2);

    expect(result.payloadExceeded).toBe(false);
  });

  // Requirement 2.4 — totalSize reflects the actual byte count
  it("accumulates totalSize across returned artifacts", async () => {
    const pipelineId = "pipe-size";
    const content = { data: "x".repeat(100) };
    const stored = await seedArtifact(store, pipelineId, content);

    const result = manager.transfer([stored.id]);

    expect(result.totalSize).toBeGreaterThan(0);
    // totalSize should equal the byte length of the serialised content
    const expectedSize = Buffer.byteLength(JSON.stringify(content), "utf8");
    expect(result.totalSize).toBe(expectedSize);
  });

  // Edge case — requesting the same ID twice is well-defined
  it("handles duplicate IDs in the request list without errors", async () => {
    const pipelineId = "pipe-dup";
    const stored = await seedArtifact(store, pipelineId, { dup: true });

    // Behaviour is implementation-defined; we only assert no exception is thrown
    // and that the result is structurally valid.
    expect(() => manager.transfer([stored.id, stored.id])).not.toThrow();
  });
});
