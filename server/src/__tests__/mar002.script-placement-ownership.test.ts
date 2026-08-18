/**
 * MAR-002 — the plugin may only destroy what it made, and may only put a script
 * where that script can safely go.
 *
 * `ArtifactLoader:_upsertScript` decided both questions by not asking them.
 *
 * It resolved the destination by name and, for any name it did not recognise,
 * returned `ReplicatedStorage` with the unknown segment demoted to a folder. A
 * generated path with a typo, or a root this plugin version has not heard of,
 * therefore landed silently in the one container that replicates to every
 * client. A server `Script` put there does not run, but its source is readable
 * by anyone in the session, so a placement mistake became a source disclosure.
 *
 * It then took whatever instance already had that name. On a class mismatch it
 * destroyed it; otherwise it overwrote `Source`. Neither branch asked whether
 * the instance was the plugin's own, and scripts it created were never marked
 * `AIStudioManaged` — so the ownership machinery the UI and world materializers
 * rely on could not see them either. A creator's hand-written module sitting
 * where generated output wanted to be was deleted without a word.
 *
 * These run the plugin's own Lua against a stubbed instance tree rather than
 * searching its source, because a string search cannot show that a creator's
 * work survived.
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

/** Runs Lua with a loader already constructed, and returns its value. */
function withLoader(body: string) {
  return plugin!.run(`
    local ArtifactLoader = require("ArtifactLoader")
    local reported = {}
    local loader = ArtifactLoader.new({
      report = function(_, message) table.insert(reported, message) end,
    })
    -- MAR-002 made provenance mandatory. These cases are about placement and
    -- creator ownership, so they carry one identity throughout; the
    -- project-scoping rules have their own file.
    loader:setProvenance("project-a", "delivery-1")
    local services = _G.__stub.services
    ${body}
  `);
}

describe("MAR-002 creator-owned scripts survive generation", () => {
  it("does not destroy a creator's instance whose class differs", async () => {
    const result = await withLoader(`
      -- A module the creator wrote by hand, where generation wants a Script.
      local creator = Instance.new("ModuleScript")
      creator.Name = "Main"
      creator.Source = "-- written by a person"
      creator.Parent = services.ServerScriptService

      pcall(function()
        loader:_upsertScript("ServerScriptService/Main.server.lua", "-- generated")
      end)

      return {
        alive = not creator:IsDestroyed(),
        source = creator.Source,
      }
    `);

    // The whole point: a name collision must not be resolved by deletion.
    expect(result).toMatchObject({
      alive: true,
      source: "-- written by a person",
    });
  });

  it("does not overwrite a creator's source when the class matches", async () => {
    const result = await withLoader(`
      local creator = Instance.new("Script")
      creator.Name = "Main"
      creator.Source = "-- written by a person"
      creator.Parent = services.ServerScriptService

      pcall(function()
        loader:_upsertScript("ServerScriptService/Main.server.lua", "-- generated")
      end)

      return creator.Source
    `);

    expect(result).toBe("-- written by a person");
  });

  it("marks the scripts it creates as its own", async () => {
    const result = await withLoader(`
      loader:_upsertScript("ServerScriptService/Generated.server.lua", "-- generated")
      local created = services.ServerScriptService:FindFirstChild("Generated")
      return created and created:GetAttribute("AIStudioManaged") or false
    `);

    // Without this the plugin cannot tell its own output from a person's on the
    // next run, which is what made the destructive branch above possible.
    expect(result).toBe(true);
  });

  it("replaces its own script from a previous generation", async () => {
    const result = await withLoader(`
      loader:_upsertScript("ServerScriptService/Generated.server.lua", "-- first")
      loader:_upsertScript("ServerScriptService/Generated.server.lua", "-- second")
      local created = services.ServerScriptService:FindFirstChild("Generated")
      return created and created.Source or "MISSING"
    `);

    // Ownership must not turn into paralysis: the plugin's own output is still
    // freely replaceable, which is the case that has to keep working.
    expect(result).toBe("-- second");
  });
});

describe("MAR-002 script placement is refused rather than guessed", () => {
  it("refuses an unrecognised root instead of redirecting to ReplicatedStorage", async () => {
    const result = await withLoader(`
      local ok, err = pcall(function()
        loader:_upsertScript("NotAService/Main.server.lua", "-- generated")
      end)
      local stray = services.ReplicatedStorage:FindFirstChild("NotAService")
      return { refused = not ok, leaked = stray ~= nil, message = tostring(err) }
    `);

    expect(result).toMatchObject({ refused: true, leaked: false });
  });

  it("does not place a server script where every client can read it", async () => {
    const result = await withLoader(`
      local ok = pcall(function()
        loader:_upsertScript("ReplicatedStorage/Secret.server.lua", "-- server only")
      end)
      local placed = services.ReplicatedStorage:FindFirstChild("Secret")
      return { accepted = ok, placed = placed ~= nil }
    `);

    // A server Script in a replicated container does not run, and its source is
    // readable by anyone in the session. Refusing it is the only safe answer.
    expect(result).toMatchObject({ accepted: false, placed: false });
  });

  it("still accepts every root the plugin legitimately targets", async () => {
    const result = await withLoader(`
      local placements = {
        { "ServerScriptService/A.server.lua", "Script" },
        { "ReplicatedStorage/B.lua", "ModuleScript" },
        { "StarterPlayerScripts/C.client.lua", "LocalScript" },
        { "ServerStorage/D.lua", "ModuleScript" },
      }
      for _, entry in ipairs(placements) do
        local ok, err = pcall(function()
          loader:_upsertScript(entry[1], "-- generated")
        end)
        if not ok then return "REFUSED " .. entry[1] .. ": " .. tostring(err) end
      end
      return "all accepted"
    `);

    // Without this the refusals above would be satisfied by a loader that
    // refuses everything.
    expect(result).toBe("all accepted");
  });
});
