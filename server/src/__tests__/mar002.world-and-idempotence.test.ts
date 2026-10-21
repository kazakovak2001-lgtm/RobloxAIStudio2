/**
 * MAR-002 closure — the world path, and applying the same export twice.
 *
 * The world materializer received the same provenance change as the UI one, but
 * only the UI path was ever run. Fixing two things and proving one is how a
 * regression gets shipped in the half nobody looked at, so this exercises the
 * world sweep and the world replace directly.
 *
 * The third part is idempotence. A Studio export is delivered over HTTP and
 * acknowledged separately, so the same command can arrive twice. Applying it
 * twice must not duplicate what it created or disturb anything it does not own.
 *
 * Concurrency is deliberately absent. Import-scoped provenance removed the
 * mutable shared state that made a cross-project race possible, which is a
 * design property rather than a measurement; real interleaving belongs to
 * MAR-016 with the rest of the chaos work.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadStudioPlugin,
  type PluginHarness,
} from "./support/studioPluginHarness";

const PROJECT_A = "project-a";
const PROJECT_B = "project-b";

let plugin: PluginHarness | undefined;

beforeEach(async () => {
  plugin = await loadStudioPlugin();
});

afterEach(() => {
  plugin?.close();
  plugin = undefined;
});

/** One world delivery. `deliver(project, delivery, ...zoneNames)`. */
function withWorld(body: string) {
  return plugin!.run(`
    local WorldSceneMaterializer = require("WorldSceneMaterializer")
    local stage = Instance.new("Folder")
    stage.Name = "WORLD_MODEL"
    stage.Parent = _G.__stub.services.Workspace

    local function deliver(projectId, deliveryId, ...)
      local zones = {}
      for index, zoneName in ipairs({ ... }) do
        table.insert(zones, {
          zoneName = zoneName,
          entities = {
            {
              entityId = zoneName .. "-entity-" .. index,
              node = { className = "Part", name = zoneName .. "Part" },
            },
          },
        })
      end
      return WorldSceneMaterializer.materialize(
        { sceneVersion = 1, zones = zones },
        stage,
        { projectId = projectId, deliveryId = deliveryId }
      )
    end
    ${body}
  `);
}

describe("MAR-002 world sweep is scoped to the project", () => {
  it("sweeps a zone this project stopped delivering", async () => {
    const result = await withWorld(`
      local delivered, err = deliver("${PROJECT_A}", "d1", "Obsolete", "Kept")
      local obsolete = stage:FindFirstChild("Obsolete")
      deliver("${PROJECT_A}", "d2", "Kept")
      return {
        firstDelivered = delivered ~= nil,
        err = tostring(err),
        swept = obsolete:IsDestroyed(),
        kept = stage:FindFirstChild("Kept") ~= nil,
      }
    `);

    // The positive control. Every refusal below would also hold for a sweep
    // that never runs.
    expect(result).toMatchObject({
      firstDelivered: true,
      swept: true,
      kept: true,
    });
  });

  it("does not sweep a zone belonging to another project", async () => {
    const result = await withWorld(`
      deliver("${PROJECT_B}", "db", "TheirZone")
      local theirs = stage:FindFirstChild("TheirZone")
      deliver("${PROJECT_A}", "da", "OurZone")
      return {
        survived = not theirs:IsDestroyed(),
        project = theirs:GetAttribute("AIStudioProject"),
      }
    `);

    expect(result).toMatchObject({ survived: true, project: PROJECT_B });
  });

  it("does not sweep a managed zone with no project", async () => {
    const result = await withWorld(`
      local legacy = Instance.new("Folder")
      legacy.Name = "LegacyZone"
      legacy:SetAttribute("AIStudioManaged", true)
      legacy.Parent = stage

      deliver("${PROJECT_A}", "da", "OurZone")

      return { survived = not legacy:IsDestroyed() }
    `);

    // From a build before provenance existed. Sweeping it would be claiming it.
    expect(result).toMatchObject({ survived: true });
  });
});

describe("MAR-002 world replace refuses what it does not own", () => {
  it("updates a zone this project already delivered", async () => {
    const result = await withWorld(`
      deliver("${PROJECT_A}", "d1", "Zone")
      local first = stage:FindFirstChild("Zone")
      local delivered = deliver("${PROJECT_A}", "d2", "Zone")
      local second = stage:FindFirstChild("Zone")
      return {
        delivered = delivered ~= nil,
        replaced = first ~= second,
        delivery = second and second:GetAttribute("AIStudioDelivery"),
      }
    `);

    expect(result).toMatchObject({
      delivered: true,
      replaced: true,
      delivery: "d2",
    });
  });

  it("refuses a zone belonging to another project", async () => {
    const result = await withWorld(`
      deliver("${PROJECT_B}", "db", "Zone")
      local theirs = stage:FindFirstChild("Zone")
      local delivered, err = deliver("${PROJECT_A}", "da", "Zone")
      return {
        refused = delivered == nil,
        message = tostring(err),
        survived = not theirs:IsDestroyed(),
        project = theirs:GetAttribute("AIStudioProject"),
      }
    `);

    expect(result).toMatchObject({
      refused: true,
      survived: true,
      project: PROJECT_B,
    });
  });

  it("refuses hand-built and unattributed work alike", async () => {
    const result = await withWorld(`
      local creator = Instance.new("Folder")
      creator.Name = "CreatorZone"
      creator.Parent = stage

      local legacy = Instance.new("Folder")
      legacy.Name = "LegacyZone"
      legacy:SetAttribute("AIStudioManaged", true)
      legacy.Parent = stage

      local handBuilt = deliver("${PROJECT_A}", "da", "CreatorZone")
      local unattributed = deliver("${PROJECT_A}", "da", "LegacyZone")

      return {
        refusedHandBuilt = handBuilt == nil,
        refusedLegacy = unattributed == nil,
        creatorAlive = not creator:IsDestroyed(),
        legacyAlive = not legacy:IsDestroyed(),
      }
    `);

    // Both get the same answer, which is the point: an instance nobody can
    // prove is this project's is treated as somebody else's.
    expect(result).toMatchObject({
      refusedHandBuilt: true,
      refusedLegacy: true,
      creatorAlive: true,
      legacyAlive: true,
    });
  });
});

describe("MAR-002 the same export applied twice", () => {
  it("does not duplicate or re-apply an already processed command", async () => {
    const result = await plugin!.run(`
      local SyncManager = require("SyncManager")
      local ArtifactLoader = require("ArtifactLoader")
      local services = _G.__stub.services

      local applied = 0
      local command = {
        id = "cmd-1",
        type = "EXPORT_PROJECT",
        payload = {
          projectId = "${PROJECT_A}",
          executionId = "execution-a",
          snapshot = { artifacts = { { id = "artifact-1", hash = "hash-1" } } },
          artifacts = { {
            id = "artifact-1", name = "Main", type = "lua",
            stage = "LUA_GENERATION", hash = "hash-1",
            content = { scripts = { {
              path = "ServerScriptService/Main.server.lua",
              content = "-- generated",
            } } },
          } },
        },
      }

      local connector = {
        isConnected = function() return true end,
        getProjectId = function() return "${PROJECT_A}" end,
        getCommands = function()
          return { success = true, data = { commands = { command } } }
        end,
        acknowledgeCommand = function()
          applied = applied + 1
          return { success = true }
        end,
        -- The backend confirms the import. A command counts as done only once
        -- it does, which is what makes an unconfirmed one safe to retry.
        reportCommand = function()
          return { success = true, data = { verified = true } }
        end,
      }

      local sync = SyncManager.new(connector, ArtifactLoader.new())
      sync:pollNow("${PROJECT_A}")
      local afterFirst = #services.ServerScriptService:GetChildren()
      sync:pollNow("${PROJECT_A}")

      return {
        acknowledged = applied,
        afterFirst = afterFirst,
        afterSecond = #services.ServerScriptService:GetChildren(),
      }
    `);

    // The queue redelivers until it is told the command is done, so the same
    // command arriving twice is ordinary rather than exceptional. It must be
    // applied once.
    expect(result).toMatchObject({
      acknowledged: 1,
      afterFirst: 1,
      afterSecond: 1,
    });
  });

  it("retries a command the backend never confirmed", async () => {
    const result = await plugin!.run(`
      local SyncManager = require("SyncManager")
      local ArtifactLoader = require("ArtifactLoader")

      local acknowledged = 0
      local command = {
        id = "cmd-1",
        type = "EXPORT_PROJECT",
        payload = {
          projectId = "${PROJECT_A}",
          executionId = "execution-a",
          snapshot = { artifacts = { { id = "artifact-1", hash = "hash-1" } } },
          artifacts = { {
            id = "artifact-1", name = "Main", type = "lua",
            stage = "LUA_GENERATION", hash = "hash-1",
            content = { scripts = { {
              path = "ServerScriptService/Main.server.lua",
              content = "-- generated",
            } } },
          } },
        },
      }
      local connector = {
        isConnected = function() return true end,
        getProjectId = function() return "${PROJECT_A}" end,
        getCommands = function()
          return { success = true, data = { commands = { command } } }
        end,
        acknowledgeCommand = function()
          acknowledged = acknowledged + 1
          return { success = true }
        end,
        -- No verification, so the import is not finished.
        reportCommand = function() return { success = true } end,
      }

      local sync = SyncManager.new(connector, ArtifactLoader.new())
      sync:pollNow("${PROJECT_A}")
      sync:pollNow("${PROJECT_A}")
      return { acknowledged = acknowledged }
    `);

    // The mirror of the case above, and the reason the guard is placed where it
    // is: an import the backend never confirmed has to be retried, or a lost
    // confirmation would strand the export forever.
    expect(result).toMatchObject({ acknowledged: 2 });
  });

  it("does not let a redelivered export disturb another project's work", async () => {
    const result = await plugin!.run(`
      local ArtifactLoader = require("ArtifactLoader")
      local services = _G.__stub.services
      local loader = ArtifactLoader.new()

      -- Another project's script, sitting where the redelivered export writes.
      loader:_upsertScript(
        "ServerScriptService/Main.server.lua", "-- theirs",
        { projectId = "${PROJECT_B}", deliveryId = "db" }
      )

      local ours = { projectId = "${PROJECT_A}", deliveryId = "da" }
      local first = pcall(function()
        loader:_upsertScript("ServerScriptService/Main.server.lua", "-- ours", ours)
      end)
      local second = pcall(function()
        loader:_upsertScript("ServerScriptService/Main.server.lua", "-- ours", ours)
      end)

      local script = services.ServerScriptService:FindFirstChild("Main")
      return {
        firstRefused = not first,
        secondRefused = not second,
        source = script.Source,
        children = #services.ServerScriptService:GetChildren(),
      }
    `);

    // Repeating a refused write must stay refused rather than eventually
    // succeeding, and must not leave a second instance behind.
    expect(result).toMatchObject({
      firstRefused: true,
      secondRefused: true,
      source: "-- theirs",
      children: 1,
    });
  });
});
