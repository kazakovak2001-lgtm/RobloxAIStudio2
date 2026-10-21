/**
 * BLUEPRINT-1 / BLUEPRINT-STALE-001 — a run is bound to the design it ran.
 *
 * Generation referenced the mutable blueprint, so editing the brief after a run
 * silently changed what that run appeared to have been generated from. Two runs
 * of "the same" blueprint could be two different designs, and nothing recorded
 * which one either had used. That defeats reproducibility, forensic tracing and
 * any later rollback.
 *
 * The versioning machinery for this already existed — `saveVersion`,
 * `getVersion`, `listVersions` — and was never called by production code. This
 * wires it in rather than adding a second way to version a blueprint.
 */

import { describe, expect, it } from "vitest";
import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../socket/streaming";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ArtifactStore } from "../pipeline/v2";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import type { BlueprintVersion } from "../types/blueprint";
import type { CreateBlueprintInput } from "../projects/types/blueprint";

const PROJECT = "project-alpha";
const OWNER = "owner-alpha";

function input(): CreateBlueprintInput {
  return {
    project_id: PROJECT,
    user_id: OWNER,
    name: "Ruins probe",
    description: "A mountain research complex with exactly three cores.",
    game_type: "adventure",
    genre: ["exploration"],
    difficulty: "medium",
    estimated_players: "solo",
    target_audience: "all ages",
  } as CreateBlueprintInput;
}

async function fixture() {
  const storage = new InMemoryStorageProvider();
  const repository = new InMemoryBlueprintRepository(storage);
  const service = new GameGenerationService(
    repository,
    new BlueprintCache(),
    new StreamingUpdateHandler(new PipelineEventEmitter()),
    new PipelineEventEmitter(),
    undefined,
    new AgentRegistry(),
    new ArtifactStore(),
  );
  const blueprint = await service.createBlueprint(OWNER, PROJECT, input());
  return { storage, repository, service, blueprint };
}

describe("BLUEPRINT-1 immutable generation snapshot", () => {
  it("binds the execution to a snapshot and its content hash", async () => {
    const f = await fixture();

    const prepared = await f.service.prepareGeneration(f.blueprint.id, OWNER);

    expect(prepared.execution.blueprint_version_id).toBeTruthy();
    // Same prefix the artifact envelopes use, because it is the same algorithm.
    expect(prepared.execution.blueprint_snapshot_hash).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(prepared.versionMutations.length).toBeGreaterThan(0);
  });

  it("does not persist the snapshot until the caller commits it", async () => {
    const f = await fixture();

    await f.service.prepareGeneration(f.blueprint.id, OWNER);

    // prepare stays free of durable writes, so a refused start leaves neither
    // an execution nor an orphan version behind.
    expect(f.storage.list("blueprint_versions")).toEqual([]);
  });

  it("keeps the run's design intact when the brief is edited afterwards", async () => {
    const f = await fixture();
    const prepared = await f.service.prepareGeneration(f.blueprint.id, OWNER);
    await f.storage.applyDurableBatch([...prepared.versionMutations]);
    const boundHash = prepared.execution.blueprint_snapshot_hash;

    // The user rewrites the brief after the run started.
    await f.service.updateBlueprint(f.blueprint.id, {
      description: "Actually a mining simulator with no cores at all.",
    });

    const version = f.storage.get<BlueprintVersion>(
      "blueprint_versions",
      prepared.execution.blueprint_version_id!,
    );
    // The snapshot still holds what the run consumed, and its hash still
    // matches, so the edit cannot be read backwards onto this execution.
    expect(version?.snapshot.description).toBe(
      "A mountain research complex with exactly three cores.",
    );
    expect(version?.snapshot_hash).toBe(boundHash);

    const current = await f.service.getBlueprint(f.blueprint.id);
    expect(current?.description).toBe(
      "Actually a mining simulator with no cores at all.",
    );
  });

  it("gives two runs of an edited blueprint different snapshot hashes", async () => {
    const f = await fixture();
    const first = await f.service.prepareGeneration(f.blueprint.id, OWNER);
    await f.storage.applyDurableBatch([...first.versionMutations]);

    await f.service.updateBlueprint(f.blueprint.id, {
      description: "A different design entirely.",
    });
    const second = await f.service.prepareGeneration(f.blueprint.id, OWNER);
    await f.storage.applyDurableBatch([...second.versionMutations]);

    // Two runs of "the same" blueprint are now distinguishable, which is the
    // whole point: previously both pointed at whatever the blueprint said last.
    expect(first.execution.blueprint_snapshot_hash).not.toBe(
      second.execution.blueprint_snapshot_hash,
    );
    expect(first.execution.blueprint_version_id).not.toBe(
      second.execution.blueprint_version_id,
    );
  });

  it("hashes the same design to the same value", async () => {
    const f = await fixture();

    const first = await f.service.prepareGeneration(f.blueprint.id, OWNER);
    const second = await f.service.prepareGeneration(f.blueprint.id, OWNER);

    // Nothing changed between them, so the content hash must not change either
    // — it depends on the design and not on when it was taken.
    expect(first.execution.blueprint_snapshot_hash).toBe(
      second.execution.blueprint_snapshot_hash,
    );
  });

  it("marks only the newest snapshot active", async () => {
    const f = await fixture();
    const first = await f.service.prepareGeneration(f.blueprint.id, OWNER);
    await f.storage.applyDurableBatch([...first.versionMutations]);
    const second = await f.service.prepareGeneration(f.blueprint.id, OWNER);
    await f.storage.applyDurableBatch([...second.versionMutations]);

    const active = f.storage
      .list<BlueprintVersion>("blueprint_versions")
      .filter((version) => version.is_active);
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(second.execution.blueprint_version_id);
  });
});
