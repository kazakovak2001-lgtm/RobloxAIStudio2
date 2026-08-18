/**
 * MAR-002 — provenance on the path an export actually takes.
 *
 * The loader enforces project ownership, but nothing set the identity it
 * enforces against. `setProvenance` existed and had no caller, so in a real
 * session every import would have been refused: the rule was correct and
 * unreachable, which is a worse state than either.
 *
 * The identity comes from the command the backend authorized and queued, whose
 * payload already carries a project and an execution and is validated before
 * anything is written. It is not read from a field the plugin could set for
 * itself, because a boundary sourced from the side being bounded is decoration.
 *
 * It travels per artifact rather than living on the loader. One loader serves
 * the whole plugin session, so identity stored on it outlives the import that
 * set it: a later call that forgot would write under whichever project went
 * last, and an import interleaved across the HTTP yields inside a poll could
 * write under the other one. Import-scoped removes both without needing anyone
 * to remember to clear anything.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadStudioPlugin,
  type PluginHarness,
} from "./support/studioPluginHarness";

let plugin: PluginHarness | undefined;

beforeEach(async () => {
  plugin = await loadStudioPlugin();
});

afterEach(() => {
  plugin?.close();
  plugin = undefined;
});

/**
 * A SyncManager wired to a connector that answers from a scripted queue, so an
 * export runs end to end without a backend.
 */
function withSync(body: string) {
  return plugin!.run(`
    local SyncManager = require("SyncManager")
    local ArtifactLoader = require("ArtifactLoader")
    local services = _G.__stub.services

    local reported = {}
    local function makeConnector(commands)
      return {
        isConnected = function() return true end,
        getProjectId = function() return "connector-project" end,
        getCommands = function()
          return { success = true, data = { commands = commands } }
        end,
        acknowledgeCommand = function() return { success = true } end,
        reportCommand = function(_, id, result)
          table.insert(reported, result)
          return { success = true }
        end,
      }
    end

    local function exportCommand(id, projectId, executionId, scriptPath, source)
      return {
        id = id,
        type = "EXPORT_PROJECT",
        payload = {
          projectId = projectId,
          executionId = executionId,
          snapshot = { artifacts = { { id = "artifact-1", hash = "hash-1" } } },
          artifacts = {
            {
              id = "artifact-1",
              name = "Main",
              type = "lua",
              stage = "LUA_GENERATION",
              hash = "hash-1",
              content = { scripts = { { path = scriptPath, content = source } } },
            },
          },
        },
      }
    end

    local function runExport(command)
      local loader = ArtifactLoader.new()
      local sync = SyncManager.new(makeConnector({ command }), loader)
      return sync:pollNow(command.payload.projectId), loader
    end
    ${body}
  `);
}

describe("MAR-002 an authorized export carries its own identity", () => {
  it("stamps the command's project and execution on what it imports", async () => {
    const result = await withSync(`
      runExport(exportCommand(
        "cmd-1", "project-a", "execution-a",
        "ServerScriptService/Main.server.lua", "-- generated"
      ))
      local script = services.ServerScriptService:FindFirstChild("Main")
      return {
        imported = script ~= nil,
        project = script and script:GetAttribute("AIStudioProject"),
        delivery = script and script:GetAttribute("AIStudioDelivery"),
      }
    `);

    // The identity is the queued command's, not anything the plugin chose.
    expect(result).toMatchObject({
      imported: true,
      project: "project-a",
      delivery: "execution-a",
    });
  });

  it("lets a later delivery of the same project update its own work", async () => {
    const result = await withSync(`
      runExport(exportCommand(
        "cmd-1", "project-a", "execution-1",
        "ServerScriptService/Main.server.lua", "-- first"
      ))
      runExport(exportCommand(
        "cmd-2", "project-a", "execution-2",
        "ServerScriptService/Main.server.lua", "-- second"
      ))
      local script = services.ServerScriptService:FindFirstChild("Main")
      return {
        source = script.Source,
        delivery = script:GetAttribute("AIStudioDelivery"),
      }
    `);

    // Ownership is by project, not by delivery, so a new export of the same
    // project manages what earlier ones left behind.
    expect(result).toMatchObject({
      source: "-- second",
      delivery: "execution-2",
    });
  });

  it("does not let another project take over that work", async () => {
    const result = await withSync(`
      runExport(exportCommand(
        "cmd-1", "project-a", "execution-a",
        "ServerScriptService/Main.server.lua", "-- theirs"
      ))
      runExport(exportCommand(
        "cmd-2", "project-b", "execution-b",
        "ServerScriptService/Main.server.lua", "-- ours"
      ))
      local script = services.ServerScriptService:FindFirstChild("Main")
      return {
        source = script.Source,
        project = script:GetAttribute("AIStudioProject"),
        failures = #reported,
      }
    `);

    // The second export cannot reuse the first project's ownership, and says so
    // rather than writing anyway.
    expect(result).toMatchObject({ source: "-- theirs", project: "project-a" });
    expect((result as { failures: number }).failures).toBeGreaterThan(0);
  });
});

describe("MAR-002 identity does not outlive its import", () => {
  it("leaves no provenance on the loader between imports", async () => {
    const result = await withSync(`
      local _, loader = runExport(exportCommand(
        "cmd-1", "project-a", "execution-a",
        "ServerScriptService/Main.server.lua", "-- generated"
      ))

      -- A later call that names no identity must not inherit the last import's.
      local ok = pcall(function()
        loader:_upsertScript("ServerScriptService/Stray.server.lua", "-- stray")
      end)

      return {
        refused = not ok,
        stray = services.ServerScriptService:FindFirstChild("Stray") == nil,
        holdsState = rawget(loader, "_provenance") ~= nil,
      }
    `);

    // The state that could go stale is not kept at all, which is why nothing
    // has to remember to clear it between projects.
    expect(result).toMatchObject({
      refused: true,
      stray: true,
      holdsState: false,
    });
  });

  it("refuses an export whose command carries no project", async () => {
    const result = await withSync(`
      local command = exportCommand(
        "cmd-1", "project-a", "execution-a",
        "ServerScriptService/Main.server.lua", "-- generated"
      )
      command.payload.projectId = ""

      runExport(command)

      return {
        imported = services.ServerScriptService:FindFirstChild("Main") ~= nil,
        failures = #reported,
      }
    `);

    // Fail closed at the transfer boundary: an export with no project is not
    // completed under a guessed one.
    expect(result).toMatchObject({ imported: false });
  });
});
