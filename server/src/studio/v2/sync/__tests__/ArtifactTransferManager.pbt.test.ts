import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ArtifactStore } from "../../../../pipeline/v2/ArtifactStore";
import { ArtifactTransferManager } from "../ArtifactTransferManager";

describe("ArtifactTransferManager properties", () => {
  // Feature: project-sync-artifact-transfer, Property 3: Artifact transfer round-trip
  it("P3 round-trips generated artifact content and metadata", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (content) => {
        const store = new ArtifactStore();
        const artifact = await store.store(
          "pipeline",
          "LUA_GENERATION",
          "property-agent",
          content,
        );
        const result = new ArtifactTransferManager(store).transfer([
          artifact.id,
        ]);
        expect(result.artifacts).toHaveLength(1);
        expect(result.artifacts[0]).toMatchObject({
          id: artifact.id,
          type: artifact.type,
          name: artifact.name,
          stage: artifact.stage,
          size: artifact.sizeBytes,
          createdAt: artifact.createdAt,
          reviewStatus: artifact.reviewStatus,
          content,
        });
      }),
      { numRuns: 100 },
    );
  });

  // Feature: project-sync-artifact-transfer, Property 4: Unknown IDs in missing list
  it("P4 reports every generated unknown ID without returning an artifact", () => {
    fc.assert(
      fc.property(fc.uuid(), (unknownId) => {
        const result = new ArtifactTransferManager(
          new ArtifactStore(),
        ).transfer([unknownId]);
        expect(result.missing).toContain(unknownId);
        expect(
          result.artifacts.some((artifact) => artifact.id === unknownId),
        ).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: project-sync-artifact-transfer, Property 5: Payload cap enforced
  it("P5 enforces the one-megabyte cap for generated oversized payloads", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1_048_576, max: 1_048_704 }),
        async (length) => {
          const store = new ArtifactStore();
          const artifact = await store.store(
            "pipeline",
            "LUA_GENERATION",
            null,
            "x".repeat(length),
          );
          const result = new ArtifactTransferManager(store).transfer([
            artifact.id,
          ]);
          expect(result.payloadExceeded).toBe(true);
          expect(result.artifacts).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
