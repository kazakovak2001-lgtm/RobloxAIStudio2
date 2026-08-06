import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ArtifactStore } from "../../../../pipeline/v2/ArtifactStore";
import { ProjectSyncManager } from "../ProjectSyncManager";
import type { SyncChange } from "../SyncTypes";

const nonNullJson = fc.jsonValue().filter((value) => value !== null);

const updateChange = (
  artifactId: string,
  timestamp: number,
  content: unknown,
): SyncChange => ({
  changeId: `change-${artifactId}`,
  artifactId,
  artifactType: "lua",
  changeType: "update",
  content,
  timestamp,
});

describe("ProjectSyncManager properties", () => {
  // Feature: project-sync-artifact-transfer, Property 1: Snapshot artifacts match store contents
  it("P1 maps every generated stored artifact into the snapshot", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.jsonValue(), { maxLength: 12 }),
        async (contents) => {
          const store = new ArtifactStore();
          const stored = [];
          for (const content of contents) {
            stored.push(
              await store.store("pipeline", "LUA_GENERATION", null, content),
            );
          }
          const snapshot = new ProjectSyncManager(store).getProjectSnapshot(
            "pipeline",
          );
          expect(snapshot?.artifactCount).toBe(stored.length);
          for (const artifact of stored) {
            expect(snapshot?.artifacts).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: artifact.id,
                  type: artifact.type,
                  name: artifact.name,
                  stage: artifact.stage,
                  size: artifact.sizeBytes,
                  createdAt: artifact.createdAt,
                }),
              ]),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: project-sync-artifact-transfer, Property 2: Version changes after mutation
  it("P2 changes the snapshot version after every generated content edit", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.jsonValue(),
        fc.jsonValue(),
        async (before, after) => {
          fc.pre(JSON.stringify(before) !== JSON.stringify(after));
          const store = new ArtifactStore();
          const artifact = await store.store(
            "pipeline",
            "LUA_GENERATION",
            null,
            before,
          );
          const manager = new ProjectSyncManager(store);
          const first = manager.getProjectSnapshot("pipeline")?.version;
          await store.edit(artifact.id, after, "property-test");
          const second = manager.getProjectSnapshot("pipeline")?.version;
          expect(second).not.toBe(first);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: project-sync-artifact-transfer, Property 6: Valid changes applied
  it("P6 applies every generated valid non-conflicting update", async () => {
    await fc.assert(
      fc.asyncProperty(nonNullJson, async (content) => {
        const store = new ArtifactStore();
        const artifact = await store.store(
          "pipeline",
          "LUA_GENERATION",
          null,
          "before",
        );
        const change = updateChange(
          artifact.id,
          artifact.createdAt + 1,
          content,
        );
        const result = await new ProjectSyncManager(store).processSyncRequest(
          "pipeline",
          [change],
        );
        expect(result.status).toBe("applied");
        expect(result.appliedChanges).toEqual([change.changeId]);
        expect(store.getById(artifact.id)?.content).toEqual(content);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: project-sync-artifact-transfer, Property 7: Conflicting changes produce conflict result
  it("P7 reports every generated stale update as a conflict", async () => {
    await fc.assert(
      fc.asyncProperty(nonNullJson, async (content) => {
        const store = new ArtifactStore();
        const artifact = await store.store(
          "pipeline",
          "LUA_GENERATION",
          null,
          "before",
        );
        const change = updateChange(
          artifact.id,
          Math.max(1, artifact.createdAt - 1),
          content,
        );
        const result = await new ProjectSyncManager(store).processSyncRequest(
          "pipeline",
          [change],
        );
        expect(result.status).toBe("conflict");
        expect(result.conflicts.map((conflict) => conflict.changeId)).toContain(
          change.changeId,
        );
      }),
      { numRuns: 100 },
    );
  });

  // Feature: project-sync-artifact-transfer, Property 8: Validation is pure
  it("P8 never mutates stored artifacts during generated validation", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (content) => {
        const store = new ArtifactStore();
        const artifact = await store.store(
          "pipeline",
          "LUA_GENERATION",
          null,
          "before",
        );
        const before = structuredClone(store.getById(artifact.id));
        new ProjectSyncManager(store).validateOnly("pipeline", [
          updateChange(artifact.id, artifact.createdAt + 1, content),
        ]);
        expect(store.getById(artifact.id)).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });
});
