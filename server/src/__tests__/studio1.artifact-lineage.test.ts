import { describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { ArtifactStore } from "../pipeline/v2/ArtifactStore";
import type { TaskNode } from "../planning/model/TaskGraph";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ProjectSyncManager } from "../studio/v2/sync/ProjectSyncManager";

function completedNode(
  agent: string,
  output: Record<string, unknown>,
): TaskNode {
  return {
    id: `task-${agent}`,
    agent,
    type: "generation",
    input: {},
    dependencies: [],
    status: "done",
    priority: 1,
    output,
    durationMs: 25,
    evaluation: { quality: 95, passed: true },
  };
}

describe("STUDIO-1a canonical artifact lineage", () => {
  it("stores only real completed task outputs under the durable execution ID", () => {
    const storage = new InMemoryStorageProvider();
    const store = new ArtifactStore(storage);
    const recorder = new GenerationArtifactRecorder(store);
    const executionId = "exec-studio-lineage";
    const luaOutput = {
      scripts: [
        {
          path: "ServerScriptService/Main.server.lua",
          content: "return { ready = true }",
        },
      ],
    };

    const recorded = recorder.record(executionId, [
      completedNode("requirements", { requirements: ["durable", "typed"] }),
      completedNode("lua_generator", luaOutput),
      completedNode("orchestrator", { manifest: { scripts: 1 } }),
      {
        ...completedNode("ui_generator", { layout: "should-not-persist" }),
        status: "failed",
        output: undefined,
        error: "UI generation failed",
      },
      completedNode("unknown_agent", { ignored: true }),
    ]);

    expect(recorded.map((artifact) => artifact.stage)).toEqual([
      "REQUIREMENTS",
      "LUA_GENERATION",
      "EXPORT",
    ]);
    expect(recorded.every((artifact) => artifact.pipelineId === executionId)).toBe(
      true,
    );
    expect(recorded[1]?.content).toEqual(luaOutput);
    expect(store.count).toBe(3);
  });

  it("reconstructs artifacts, reviews, snapshots, and transfers from storage", () => {
    const storage = new InMemoryStorageProvider();
    const executionId = "exec-studio-restart";
    const storeBeforeRestart = new ArtifactStore(storage);
    const recorder = new GenerationArtifactRecorder(storeBeforeRestart);

    const [luaArtifact, exportArtifact] = recorder.record(executionId, [
      completedNode("lua_generator", {
        scripts: [
          {
            path: "ReplicatedStorage/Shared/Config.lua",
            content: "return { version = 3 }",
          },
        ],
      }),
      completedNode("orchestrator", {
        package: "production-ready",
        artifactCount: 1,
      }),
    ]);

    expect(luaArtifact).toBeDefined();
    expect(exportArtifact).toBeDefined();
    storeBeforeRestart.approve(luaArtifact!.id, "quality-controller");
    storeBeforeRestart.edit(
      exportArtifact!.id,
      { package: "reviewed", artifactCount: 1 },
      "release-controller",
    );

    const storeAfterRestart = new ArtifactStore(storage);
    const restored = storeAfterRestart.getByPipeline(executionId);

    expect(restored).toHaveLength(2);
    expect(storeAfterRestart.getById(luaArtifact!.id)?.reviewStatus).toBe(
      "approved",
    );
    expect(storeAfterRestart.getById(exportArtifact!.id)?.content).toEqual({
      package: "reviewed",
      artifactCount: 1,
    });
    expect(storeAfterRestart.getReviewSummary(executionId)).toMatchObject({
      total: 2,
      approved: 1,
      edited: 1,
      allApproved: true,
    });

    const syncManager = new ProjectSyncManager(storeAfterRestart);
    const snapshot = syncManager.getProjectSnapshot(executionId);
    expect(snapshot?.projectId).toBe(executionId);
    expect(snapshot?.artifactCount).toBe(2);
    expect(snapshot?.artifacts.map((artifact) => artifact.id)).toEqual(
      expect.arrayContaining([luaArtifact!.id, exportArtifact!.id]),
    );

    const transfer = syncManager
      .getTransferManager()
      .transfer([luaArtifact!.id, exportArtifact!.id]);
    expect(transfer.missing).toEqual([]);
    expect(transfer.payloadExceeded).toBe(false);
    expect(transfer.artifacts).toHaveLength(2);
    expect(transfer.artifacts[0]?.content).toEqual(luaArtifact!.content);
  });
});
