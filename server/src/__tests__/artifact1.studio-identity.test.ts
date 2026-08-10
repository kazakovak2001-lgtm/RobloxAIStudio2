/**
 * ARTIFACT-1 — deterministic Studio identity for delivered artifacts.
 *
 * The plugin names each metadata instance after `artifact.name` rather than
 * `artifact.id`, because `ArtifactStore.store` mints the id with `randomUUID`
 * and an id-named instance therefore accumulated a fresh copy on every
 * regeneration instead of replacing the previous one.
 *
 * These tests pin the property the plugin now depends on: the name is derived
 * from the stage, so it is stable across regenerations while the id is not.
 */

import { describe, it, expect } from "vitest";
import { ArtifactStore } from "../pipeline/v2/ArtifactStore";
import { STAGE_ORDER, type StageName } from "../pipeline/v2";
import { GENERATION_ARTIFACT_STAGE_MAP } from "../studio/artifacts/GenerationArtifactRecorder";

/** ARTIFACT-CONTRACT-2 requires an owning project on every new artifact. */
const ARTIFACT_TEST_PROJECT = "artifact-contract-test-project";

async function storeAll(pipelineId: string) {
  const store = new ArtifactStore();
  const stored = [];
  for (const stage of STAGE_ORDER) {
    stored.push(
      await store.store(
        pipelineId,
        stage,
        "lua_generator",
        { stage },
        { projectId: ARTIFACT_TEST_PROJECT },
      ),
    );
  }
  return stored;
}

describe("ARTIFACT-1 Studio identity", () => {
  it("gives every stage a non-empty artifact name", async () => {
    for (const artifact of await storeAll("exec-names")) {
      expect(artifact.name).toBeTruthy();
      expect(artifact.name.trim()).toBe(artifact.name);
    }
  });

  it("keeps names unique per stage, so one folder cannot collide", async () => {
    const names = (await storeAll("exec-unique")).map((a) => a.name);

    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * The core property. Two runs of the same stage produce different ids and
   * the same name — which is exactly why the name is the correct instance
   * identity and the id is not.
   */
  it.each(STAGE_ORDER)(
    "regenerating %s changes the id but not the name",
    async (stage: StageName) => {
      const store = new ArtifactStore();
      const first = await store.store(
        "exec-1",
        stage,
        "lua_generator",
        { v: 1 },
        { projectId: ARTIFACT_TEST_PROJECT },
      );
      const second = await store.store(
        "exec-2",
        stage,
        "lua_generator",
        { v: 2 },
        { projectId: ARTIFACT_TEST_PROJECT },
      );

      expect(second.id).not.toBe(first.id);
      expect(second.name).toBe(first.name);
    },
  );

  /**
   * The plugin folder is per stage, so name-based identity is only unambiguous
   * while one execution cannot produce two artifacts in the same stage. The
   * recorder's agent-to-stage map is what guarantees that, so pin it here
   * rather than leaving the assumption implicit.
   */
  it("maps no two agents to the same stage", () => {
    const stages = Object.values(GENERATION_ARTIFACT_STAGE_MAP);

    expect(new Set(stages).size).toBe(stages.length);
  });

  it("mints ids that are not stable, which is what broke delivery", async () => {
    const store = new ArtifactStore();
    const a = await store.store(
      "exec-a",
      "REQUIREMENTS",
      "lua_generator",
      { v: 1 },
      { projectId: ARTIFACT_TEST_PROJECT },
    );
    const b = await store.store(
      "exec-a",
      "REQUIREMENTS",
      "lua_generator",
      { v: 1 },
      { projectId: ARTIFACT_TEST_PROJECT },
    );

    // Identical stage, pipeline and content still yield different ids. An
    // instance named after this value can never be idempotent.
    expect(b.id).not.toBe(a.id);
  });
});
