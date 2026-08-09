/**
 * SECREVIEW-1 — the advisory contract, end to end.
 *
 * The reviewer is deliberately not a gate in this slice. These tests pin that
 * decision at the level where it could actually be violated: a finding must
 * not stop the artifact being recorded, transferred or delivered, and the
 * report must carry its own analysis and enforcement mode all the way into
 * Studio so a historical record can never be reinterpreted under a later
 * blocking regime.
 */

import { describe, it, expect } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { ArtifactStore } from "../pipeline/v2/ArtifactStore";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ProjectSyncManager } from "../studio/v2/sync/ProjectSyncManager";
import type { TaskNode } from "../planning/model/TaskGraph";
import type { SecurityReviewReport } from "../validation/luaSecurityReview";

/**
 * Playable Lua that is also exploitable: it satisfies every playability rule
 * while handing a client-supplied amount straight to a score. This is exactly
 * the combination the platform could previously ship with nothing to say
 * about it.
 */
const EXPLOITABLE_SERVER = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local award = Instance.new("RemoteEvent")
award.Name = "AwardPoints"
award.Parent = ReplicatedStorage

local world = Instance.new("Folder")
world.Name = "GeneratedWorld"
world.Parent = workspace

local pad = Instance.new("Part")
pad.Name = "ScorePad"
pad.Anchored = true
pad.Parent = world
pad.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if not player then return end
  award:FireAllClients(1, 5)
end)

award.OnServerEvent:Connect(function(player, amount)
  player.leaderstats.Score.Value += amount
end)`;

const PLAYABLE_CLIENT = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "ScoreHud"
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Text = "Score 0/5"
label.Parent = gui

ReplicatedStorage:WaitForChild("AwardPoints").OnClientEvent:Connect(function(score, target)
  label.Text = "Score " .. score .. "/" .. target
end)`;

function luaNode(): TaskNode {
  return {
    id: "task-lua_generator",
    agent: "lua_generator",
    type: "generation",
    input: {},
    dependencies: [],
    status: "done",
    priority: 1,
    durationMs: 10,
    output: {
      scripts: [
        {
          path: "ServerScriptService/Main.server.lua",
          content: EXPLOITABLE_SERVER,
        },
        {
          path: "StarterPlayerScripts/Hud.client.lua",
          content: PLAYABLE_CLIENT,
        },
      ],
    },
  };
}

async function recordExploitableGeneration(executionId: string) {
  const storage = new InMemoryStorageProvider();
  const store = new ArtifactStore(storage);
  const recorded = await new GenerationArtifactRecorder(store).record(
    executionId,
    [luaNode()],
  );
  return { storage, store, recorded };
}

describe("an advisory finding does not negate delivery", () => {
  it("records the Lua even though the review found a critical defect", async () => {
    const { recorded } = await recordExploitableGeneration("exec-advisory");

    const lua = recorded.find((a) => a.stage === "LUA_GENERATION");
    const review = recorded.find((a) => a.stage === "SECURITY_REVIEW");
    const report = review!.content as SecurityReviewReport;

    // The finding is real...
    expect(report.clean).toBe(false);
    expect(report.findings.some((f) => f.severity === "critical")).toBe(true);
    // ...and the Lua is recorded anyway.
    expect(lua).toBeDefined();
    expect(report.enforcement).toBe("advisory");
  });

  it("still transfers the reviewed Lua to Studio", async () => {
    const { store } = await recordExploitableGeneration("exec-advisory-sync");
    const snapshot = new ProjectSyncManager(store).getProjectSnapshot(
      "exec-advisory-sync",
    );

    // Delivery is unaffected: both the Lua and its review travel.
    expect(snapshot?.artifacts.map((a) => a.stage)).toEqual(
      expect.arrayContaining(["LUA_GENERATION", "SECURITY_REVIEW"]),
    );
  });

  it("reviews the exact Lua artifact it is recorded beside", async () => {
    const { recorded } =
      await recordExploitableGeneration("exec-advisory-pair");

    const lua = recorded.find((a) => a.stage === "LUA_GENERATION")!;
    const review = recorded.find((a) => a.stage === "SECURITY_REVIEW")!;
    const report = review.content as SecurityReviewReport;
    const luaScripts = (lua.content as { scripts: Array<{ path: string }> })
      .scripts;

    // Same execution, and every reviewed path belongs to that artifact.
    expect(review.pipelineId).toBe(lua.pipelineId);
    expect(report.reviewedScriptCount).toBe(luaScripts.length);
    for (const finding of report.findings) {
      expect(luaScripts.map((s) => s.path)).toContain(finding.path);
    }
  });
});

describe("pending human review affects allApproved without blocking", () => {
  it("leaves the execution not all-approved until the review is approved", async () => {
    const { store, recorded } = await recordExploitableGeneration(
      "exec-advisory-approval",
    );
    const review = recorded.find((a) => a.stage === "SECURITY_REVIEW")!;

    expect(store.getReviewSummary("exec-advisory-approval")).toMatchObject({
      allApproved: false,
    });

    for (const artifact of recorded) {
      await store.approve(artifact.id, "operator");
    }

    expect(store.getReviewSummary("exec-advisory-approval")).toMatchObject({
      allApproved: true,
    });
    expect(store.getById(review.id)?.reviewStatus).toBe("approved");
  });
});

describe("the enforcement contract survives persistence and transfer", () => {
  it("keeps analysisMode and enforcement after a storage round trip", async () => {
    const { storage, recorded } = await recordExploitableGeneration(
      "exec-advisory-restart",
    );
    const review = recorded.find((a) => a.stage === "SECURITY_REVIEW")!;

    // Rebuild from the durable provider, as a restart would.
    const restored = new ArtifactStore(storage).getById(review.id);
    const report = restored!.content as SecurityReviewReport;

    expect(report.analysisMode).toBe("deterministic-pattern");
    expect(report.enforcement).toBe("advisory");
  });

  it("carries the contract in the payload Studio receives", async () => {
    const { store } = await recordExploitableGeneration("exec-advisory-studio");
    const transfer = new ProjectSyncManager(store)
      .getTransferManager()
      .transfer(
        store
          .getByPipeline("exec-advisory-studio")
          .filter((a) => a.stage === "SECURITY_REVIEW")
          .map((a) => a.id),
      );

    const shipped = transfer.artifacts[0].content as SecurityReviewReport;
    expect(shipped.analysisMode).toBe("deterministic-pattern");
    expect(shipped.enforcement).toBe("advisory");
    expect(shipped.limits.length).toBeGreaterThan(0);
  });
});
