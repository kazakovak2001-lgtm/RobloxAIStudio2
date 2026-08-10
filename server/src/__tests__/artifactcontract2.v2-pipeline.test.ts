import { describe, it, expect } from "vitest";

import {
  AGENTLESS_STAGE_PRODUCERS,
  ArtifactStore,
  PipelineEngine,
  STAGE_AGENT_MAP,
  STAGE_ORDER,
  createPipelineState,
  type PipelineArtifact,
  type PipelineState,
} from "../pipeline/v2";

/**
 * ARTIFACT-CONTRACT-2 on the v2 pipeline reached through `routes/concept.ts`.
 *
 * This path writes artifacts through its own code, so the envelope guarantees
 * have to hold here too — an artifact produced by the concept pipeline is as
 * durable as one produced by the generation pipeline.
 */

const PROJECT = "v2-envelope-project";

/** A completed state for every stage, as the executor would leave it. */
function completedState(): PipelineState {
  const state = createPipelineState(PROJECT);
  return {
    ...state,
    status: "completed",
    completedStages: [...STAGE_ORDER],
    stages: state.stages.map((stage) => ({
      ...stage,
      status: "completed" as const,
      output: { stage: stage.name },
    })),
  };
}

/** Drive the engine's own artifact-writing path and read back what it wrote. */
async function storeAll(): Promise<{
  engine: PipelineEngine;
  store: ArtifactStore;
  artifacts: PipelineArtifact[];
}> {
  const engine = new PipelineEngine();
  const state = completedState();

  await (
    engine as unknown as {
      storeArtifactsFromState(state: PipelineState): Promise<void>;
    }
  ).storeArtifactsFromState(state);

  return {
    engine,
    store: (engine as unknown as { artifactStore: ArtifactStore })
      .artifactStore,
    artifacts: engine.getArtifacts(state.pipelineId),
  };
}

describe("ARTIFACT-CONTRACT-2 on the v2 concept pipeline", () => {
  it("gives every stage the current envelope and the run's project", async () => {
    const { artifacts } = await storeAll();

    expect(artifacts.length).toBe(STAGE_ORDER.length);
    for (const artifact of artifacts) {
      expect(artifact.schemaVersion).toBe(1);
      expect(artifact.projectId).toBe(PROJECT);
      expect(artifact.contentHash).toMatch(/^sha256:/);
      expect(artifact.producer).toBeDefined();
    }
  });

  it("attributes each agentless stage to the producer that actually made it", async () => {
    // Five stages here run without an agent and they are not one producer.
    // Stamping them all as the validation pass would record false provenance.
    const { artifacts } = await storeAll();
    const producerFor = new Map(
      artifacts.map((artifact) => [artifact.stage, artifact.producer]),
    );

    const agentless = STAGE_ORDER.filter((stage) => !STAGE_AGENT_MAP[stage]);
    expect(agentless.length).toBeGreaterThan(1);

    for (const stage of agentless) {
      expect(producerFor.get(stage)).toEqual({
        type: "deterministic",
        id: AGENTLESS_STAGE_PRODUCERS[stage],
        version: 1,
      });
    }
    // And they are genuinely different producers, not one repeated.
    const distinct = new Set(
      agentless.map((stage) => producerFor.get(stage)?.id),
    );
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("binds each derived stage to the exact upstream it was computed from", async () => {
    const { artifacts } = await storeAll();
    const byStage = new Map(
      artifacts.map((artifact) => [artifact.stage, artifact]),
    );

    const validation = byStage.get("VALIDATION")!;
    const review = byStage.get("SECURITY_REVIEW")!;
    const lua = byStage.get("LUA_GENERATION")!;
    const world = byStage.get("WORLD_MODEL")!;

    expect(review.dependencies).toEqual([
      {
        artifactId: lua.id,
        stage: "LUA_GENERATION",
        contentHash: lua.contentHash,
      },
    ]);

    const validationBinds = new Map(
      (validation.dependencies ?? []).map((dependency) => [
        dependency.stage,
        dependency.contentHash,
      ]),
    );
    expect(validationBinds.get("LUA_GENERATION")).toBe(lua.contentHash);
    expect(validationBinds.get("WORLD_MODEL")).toBe(world.contentHash);
  });

  it("makes an edited upstream detectable by the reports that read it", async () => {
    // The concept artifact-edit endpoint can change Lua after the fact. The
    // reports must not silently keep reading as current.
    const { store: artifactStore, artifacts: stored } = await storeAll();
    const lua = stored.find((a) => a.stage === "LUA_GENERATION")!;
    const review = stored.find((a) => a.stage === "SECURITY_REVIEW")!;

    const edited = await artifactStore.edit(
      lua.id,
      { stage: "LUA_GENERATION", revised: true },
      "reviewer",
    );

    expect(edited!.contentHash).not.toBe(lua.contentHash);

    // Read back through the store rather than asserting on the snapshot taken
    // before the edit — a snapshot cannot change, so it could not catch a
    // future change that rewrote dependency hashes on downstream artifacts.
    const persistedReview = artifactStore.getById(review.id);
    const bound = persistedReview?.dependencies ?? [];

    expect(bound).toHaveLength(1);
    // The review still names the bytes it read, which is what makes the drift
    // visible rather than silent.
    expect(bound[0].contentHash).toBe(lua.contentHash);
    expect(bound[0].contentHash).not.toBe(edited!.contentHash);
  });
});

describe("ARTIFACT-CONTRACT-2 legacy package ownership", () => {
  it("owns adapted artifacts by the package's project, not its package id", async () => {
    // The package id and the project are different values, and the same
    // method synchronizes against the project. Owning by package id would
    // make ownership disagree with the run it belongs to.
    const { StudioIntegrationManager } =
      await import("../studio/integration/StudioIntegrationManager");
    const { getSharedStudioRuntime } =
      await import("../studio/v2/StudioRuntime");

    const manager = new StudioIntegrationManager();
    const packageId = "legacy-package-ownership";
    const projectId = "legacy-owning-project";
    manager.connect("studio-legacy-owner", projectId);

    await manager.synchronize("studio-legacy-owner", {
      packageId,
      projectId,
      sessionId: "legacy-session",
      blueprint: {},
      executionPlan: {},
      scripts: [
        { path: "ServerScriptService/Main.server.lua", content: "print(1)" },
      ],
      configs: [],
      metadata: { generationId: "legacy-generation" },
      validationReport: { valid: true, errors: [], warnings: [] },
      totalArtifacts: 1,
      totalSizeBytes: 32,
      generatedAt: 1,
    } as never);

    const artifacts =
      getSharedStudioRuntime().artifacts.getByPipeline(packageId);

    expect(artifacts.length).toBeGreaterThan(0);
    for (const artifact of artifacts) {
      expect(artifact.projectId).toBe(projectId);
      expect(artifact.projectId).not.toBe(packageId);
      expect(artifact.producer).toEqual({
        type: "deterministic",
        id: "legacy-package-adapter",
        version: 1,
      });
    }
    // Explicit budget: this drives the real synchronize path — validation,
    // artifact writes and a queued export — through the shared Studio runtime,
    // which exceeds the 5s default when the suite runs in parallel.
  }, 20000);
});
