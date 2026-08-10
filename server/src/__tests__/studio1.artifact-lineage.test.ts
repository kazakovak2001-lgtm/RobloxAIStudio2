import { describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { ArtifactStore } from "../pipeline/v2/ArtifactStore";
import type { TaskNode } from "../planning/model/TaskGraph";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ProjectSyncManager } from "../studio/v2/sync/ProjectSyncManager";

/** ARTIFACT-CONTRACT-2 requires an owning project on every new artifact. */
const ARTIFACT_TEST_PROJECT = "artifact-contract-test-project";

const playableServer = `local world = Instance.new("Folder")
world.Name = "GeneratedWorld"
world.Parent = workspace
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local progress = Instance.new("RemoteEvent")
progress.Name = "ObjectiveProgress"
progress.Parent = ReplicatedStorage
local collectible = Instance.new("Part")
collectible.Name = "Collectible"
collectible.Parent = world
collectible.Touched:Connect(function(hit)
  if hit.Parent then
    progress:FireAllClients(1, 1)
    collectible:Destroy()
  end
end)`;

const playableClient = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Name = "ObjectiveHud"
gui.Parent = playerGui
local label = Instance.new("TextLabel")
label.Text = "TODO list: collect the item"
label.Parent = gui
ReplicatedStorage:WaitForChild("ObjectiveProgress").OnClientEvent:Connect(function(score, target)
  label.Text = "Collected " .. score .. "/" .. target
end)`;

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
  it("stores only real completed task outputs under the durable execution ID", async () => {
    const storage = new InMemoryStorageProvider();
    const store = new ArtifactStore(storage);
    const recorder = new GenerationArtifactRecorder(store);
    const executionId = "exec-studio-lineage";
    const luaOutput = {
      scripts: [
        {
          path: "ServerScriptService/Main.server.lua",
          content: playableServer,
        },
        {
          path: "StarterPlayerScripts/Main.client.lua",
          content: playableClient,
        },
      ],
    };

    const recorded = await recorder.record(
      executionId,
      [
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
      ],
      ARTIFACT_TEST_PROJECT,
    );

    // SECREVIEW-1 records a trust-boundary review beside the Lua it reviews,
    // so it is emitted by the recorder rather than by an agent node.
    // PIPELINE-1B records what deterministic validation found, last, for the
    // same reason: it is produced by the recorder, not by an agent node.
    expect(recorded.map((artifact) => artifact.stage)).toEqual([
      "REQUIREMENTS",
      "LUA_GENERATION",
      "SECURITY_REVIEW",
      "EXPORT",
      "WORLD_MODEL",
      "VALIDATION",
    ]);
    const review = recorded.find((a) => a.stage === "SECURITY_REVIEW");
    expect(review?.agent).toBeNull();
    expect(review?.name).toBe("securityReport.json");
    expect(
      recorded.every((artifact) => artifact.pipelineId === executionId),
    ).toBe(true);
    expect(recorded[1]?.content).toEqual(luaOutput);
    expect(store.count).toBe(6);
  });

  it("normalizes the real LuaGeneratorAgent output into Studio scripts", async () => {
    const storage = new InMemoryStorageProvider();
    const store = new ArtifactStore(storage);
    const recorder = new GenerationArtifactRecorder(store);

    const [artifact] = await recorder.record(
      "exec-real-lua-output",
      [
        completedNode("lua_generator", {
          generatedCode: { scripts: [], modules: {} },
          lua_generator: {
            server: [
              {
                name: "GameManager.server.lua",
                code: playableServer,
              },
            ],
            client: [
              {
                name: "LocalController.client.lua",
                code: playableClient,
              },
            ],
            shared: [
              {
                name: "GameConfig.lua",
                code: "return { version = 1 }",
              },
            ],
            modules: [],
          },
        }),
      ],
      ARTIFACT_TEST_PROJECT,
    );

    expect(artifact?.type).toBe("lua");
    expect(artifact?.content).toEqual({
      scripts: [
        {
          path: "ServerScriptService/GameManager.server.lua",
          content: playableServer,
        },
        {
          path: "StarterPlayerScripts/LocalController.client.lua",
          content: playableClient,
        },
        {
          path: "ReplicatedStorage/Shared/GameConfig.lua",
          content: "return { version = 1 }",
        },
      ],
    });
  });

  it("rejects completed Lua outputs that cannot materialize real scripts", async () => {
    const storage = new InMemoryStorageProvider();
    const recorder = new GenerationArtifactRecorder(new ArtifactStore(storage));

    await expect(
      recorder.record(
        "exec-empty-lua-output",
        [
          completedNode("lua_generator", {
            generatedCode: { scripts: [], modules: {} },
            lua_generator: {
              server: [],
              client: [],
              shared: [],
              modules: [],
            },
          }),
        ],
        ARTIFACT_TEST_PROJECT,
      ),
    ).rejects.toThrow("non-empty Studio scripts array");

    // PIPELINE-1B. The rejection itself is now durable: exactly one artifact
    // survives, the validation report saying why. No content is persisted, so
    // the invariant this test exists for — a rejected generation leaves no
    // package a later consumer could deliver — is unchanged.
    const stored = await new ArtifactStore(storage).getByPipeline(
      "exec-empty-lua-output",
    );
    expect(stored.map((artifact) => artifact.stage)).toEqual(["VALIDATION"]);
  });

  it("rejects comment-only runtime evidence and nested fake service roots", async () => {
    const storage = new InMemoryStorageProvider();
    const recorder = new GenerationArtifactRecorder(new ArtifactStore(storage));
    const commentOnly = `-- Instance.new("Part") workspace
-- collectible.Touched:Connect(function() end)
-- padding padding padding padding padding padding padding padding padding padding padding`;

    await expect(
      recorder.record(
        "exec-comment-only",
        [
          completedNode("lua_generator", {
            scripts: [
              {
                path: "ReplicatedStorage/Fake/ServerScriptService/Main.server.lua",
                content: commentOnly,
              },
              {
                path: "ReplicatedStorage/Fake/StarterPlayerScripts/Hud.client.lua",
                content: `${commentOnly}\n-- Instance.new("ScreenGui") PlayerGui`,
              },
            ],
          }),
        ],
        ARTIFACT_TEST_PROJECT,
      ),
    ).rejects.toThrow("at least one server Script is required");

    await expect(
      recorder.record(
        "exec-comment-only-roots",
        [
          completedNode("lua_generator", {
            scripts: [
              {
                path: "ServerScriptService/Main.server.lua",
                content: `${commentOnly}\nlocal example = [[Instance.new("Part") workspace Touched:Connect(function() end)]]`,
              },
              {
                path: "StarterPlayerScripts/Hud.client.lua",
                content: `${commentOnly}\nlocal example = 'Instance.new("ScreenGui") PlayerGui'`,
              },
            ],
          }),
        ],
        ARTIFACT_TEST_PROJECT,
      ),
    ).rejects.toThrow("is too small to implement runtime behavior");

    // One validation report per rejected run, and no content from either.
    const store = new ArtifactStore(storage);
    expect(
      [
        ...(await store.getByPipeline("exec-comment-only")),
        ...(await store.getByPipeline("exec-comment-only-roots")),
      ].map((artifact) => artifact.stage),
    ).toEqual(["VALIDATION", "VALIDATION"]);
  });

  it("reconstructs artifacts, reviews, snapshots, and transfers from storage", async () => {
    const storage = new InMemoryStorageProvider();
    const executionId = "exec-studio-restart";
    const storeBeforeRestart = new ArtifactStore(storage);
    const recorder = new GenerationArtifactRecorder(storeBeforeRestart);

    const [luaArtifact, exportArtifact] = await recorder.record(
      executionId,
      [
        completedNode("lua_generator", {
          scripts: [
            {
              path: "ServerScriptService/Main.server.lua",
              content: playableServer,
            },
            {
              path: "StarterPlayerScripts/Main.client.lua",
              content: playableClient,
            },
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
      ],
      ARTIFACT_TEST_PROJECT,
    );

    expect(luaArtifact).toBeDefined();
    expect(exportArtifact).toBeDefined();
    await storeBeforeRestart.approve(luaArtifact!.id, "quality-controller");
    await storeBeforeRestart.edit(
      exportArtifact!.id,
      { package: "reviewed", artifactCount: 1 },
      "release-controller",
    );

    const storeAfterRestart = new ArtifactStore(storage);
    const restored = storeAfterRestart.getByPipeline(executionId);

    // Lua, its security review, the export manifest, the world model and the
    // validation report all survive restart.
    expect(restored).toHaveLength(5);
    expect(restored.map((a) => a.stage)).toContain("VALIDATION");
    expect(restored.map((a) => a.stage)).toContain("SECURITY_REVIEW");
    expect(storeAfterRestart.getById(luaArtifact!.id)?.reviewStatus).toBe(
      "approved",
    );
    expect(storeAfterRestart.getById(exportArtifact!.id)?.content).toEqual({
      package: "reviewed",
      artifactCount: 1,
    });
    // The security review and the validation report are both recorded
    // unreviewed, so an execution is no longer all-approved until someone
    // approves them. Truthful, and inert: nothing gates Studio delivery on
    // this summary today.
    expect(storeAfterRestart.getReviewSummary(executionId)).toMatchObject({
      total: 5,
      approved: 1,
      edited: 1,
      pending: 3,
      allApproved: false,
    });

    const syncManager = new ProjectSyncManager(storeAfterRestart);
    const snapshot = syncManager.getProjectSnapshot(executionId);
    expect(snapshot?.projectId).toBe(executionId);
    // The security report travels with the export like every other non-Lua
    // artifact, so a creator can read the findings in Studio. ARTIFACT-1 names
    // it by stage, so repeated exports replace rather than accumulate it.
    expect(snapshot?.artifactCount).toBe(5);
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
