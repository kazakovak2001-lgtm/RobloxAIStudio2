/**
 * MAR-002 — the loader's own artifacts belong to a project too.
 *
 * The materializers now stamp a project and a delivery and refuse to touch
 * another project's work. The loader writes two kinds of instance itself —
 * scripts, and the `StringValue` that carries metadata — and both were left
 * deciding ownership from the managed mark alone. So the invariant held for a
 * generated screen and not for the script beside it, which is the weaker half
 * of a boundary deciding the whole boundary.
 *
 * Same rule, same failure mode: managed says AI Studio made it, not that this
 * project did. An instance carrying the mark and no project predates provenance
 * and counts as foreign, because claiming it would be the permissive guess.
 *
 * These run the plugin's own Lua. Every refusal is paired with the same
 * operation succeeding for the project that owns the instance, since "nothing
 * was overwritten" is also what a loader that refuses everything produces.
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

/** A loader already carrying provenance, unless the body replaces it. */
function withLoader(body: string) {
  return plugin!.run(`
    local ArtifactLoader = require("ArtifactLoader")
    local loader = ArtifactLoader.new()
    loader:setProvenance("${PROJECT_A}", "delivery-1")
    local services = _G.__stub.services
    ${body}
  `);
}

describe("MAR-002 loader stamps provenance on what it creates", () => {
  it("stamps project and delivery on a script", async () => {
    const result = await withLoader(`
      loader:_upsertScript("ServerScriptService/Main.server.lua", "-- generated")
      local script = services.ServerScriptService:FindFirstChild("Main")
      return {
        managed = script:GetAttribute("AIStudioManaged"),
        project = script:GetAttribute("AIStudioProject"),
        delivery = script:GetAttribute("AIStudioDelivery"),
      }
    `);

    expect(result).toMatchObject({
      managed: true,
      project: PROJECT_A,
      delivery: "delivery-1",
    });
  });

  it("stamps project and delivery on a metadata value", async () => {
    const result = await withLoader(`
      loader:_loadMetadataArtifact({
        id = "artifact-1", name = "Report", type = "report",
        stage = "OTHER", content = { ok = true },
      })
      local stage = services.ReplicatedStorage:FindFirstChild("AIStudioArtifacts")
        :FindFirstChild("OTHER")
      local value = stage:GetChildren()[1]
      return {
        managed = value:GetAttribute("AIStudioManaged"),
        project = value:GetAttribute("AIStudioProject"),
        delivery = value:GetAttribute("AIStudioDelivery"),
      }
    `);

    expect(result).toMatchObject({
      managed: true,
      project: PROJECT_A,
      delivery: "delivery-1",
    });
  });
});

describe("MAR-002 scripts are scoped to their project", () => {
  it("lets a project update its own script", async () => {
    const result = await withLoader(`
      loader:_upsertScript("ServerScriptService/Main.server.lua", "-- first")
      loader:setProvenance("${PROJECT_A}", "delivery-2")
      loader:_upsertScript("ServerScriptService/Main.server.lua", "-- second")
      local script = services.ServerScriptService:FindFirstChild("Main")
      return { source = script.Source, delivery = script:GetAttribute("AIStudioDelivery") }
    `);

    // The positive control: ownership must not stop a project replacing what it
    // owns, or every refusal below would be satisfied by a loader that refuses
    // everything.
    expect(result).toMatchObject({
      source: "-- second",
      delivery: "delivery-2",
    });
  });

  it("refuses a script belonging to another project", async () => {
    const result = await withLoader(`
      loader:setProvenance("${PROJECT_B}", "delivery-b")
      loader:_upsertScript("ServerScriptService/Main.server.lua", "-- theirs")
      local theirs = services.ServerScriptService:FindFirstChild("Main")

      loader:setProvenance("${PROJECT_A}", "delivery-a")
      local ok, err = pcall(function()
        loader:_upsertScript("ServerScriptService/Main.server.lua", "-- ours")
      end)

      return {
        refused = not ok,
        message = tostring(err),
        source = theirs.Source,
        project = theirs:GetAttribute("AIStudioProject"),
      }
    `);

    expect(result).toMatchObject({
      refused: true,
      source: "-- theirs",
      project: PROJECT_B,
    });
  });

  it("treats a managed script with no project as foreign", async () => {
    const result = await withLoader(`
      local legacy = Instance.new("Script")
      legacy.Name = "Main"
      legacy.Source = "-- from a build before provenance"
      legacy:SetAttribute("AIStudioManaged", true)
      legacy.Parent = services.ServerScriptService

      local ok, err = pcall(function()
        loader:_upsertScript("ServerScriptService/Main.server.lua", "-- ours")
      end)

      return {
        refused = not ok,
        message = tostring(err),
        source = legacy.Source,
        alive = not legacy:IsDestroyed(),
      }
    `);

    expect(result).toMatchObject({
      refused: true,
      alive: true,
      source: "-- from a build before provenance",
    });
  });
});

describe("MAR-002 metadata values are scoped to their project", () => {
  it("lets a project update its own metadata value", async () => {
    const result = await withLoader(`
      loader:_loadMetadataArtifact({
        id = "artifact-1", name = "Report", type = "report",
        stage = "OTHER", content = { round = 1 },
      })
      loader:setProvenance("${PROJECT_A}", "delivery-2")
      loader:_loadMetadataArtifact({
        id = "artifact-1", name = "Report", type = "report",
        stage = "OTHER", content = { round = 2 },
      })
      local stage = services.ReplicatedStorage:FindFirstChild("AIStudioArtifacts")
        :FindFirstChild("OTHER")
      local value = stage:GetChildren()[1]
      return {
        children = #stage:GetChildren(),
        delivery = value:GetAttribute("AIStudioDelivery"),
        updated = string.find(value.Value, "2") ~= nil,
      }
    `);

    expect(result).toMatchObject({
      children: 1,
      delivery: "delivery-2",
      updated: true,
    });
  });

  it("refuses a metadata value belonging to another project", async () => {
    const result = await withLoader(`
      loader:setProvenance("${PROJECT_B}", "delivery-b")
      loader:_loadMetadataArtifact({
        id = "artifact-1", name = "Report", type = "report",
        stage = "OTHER", content = { owner = "b" },
      })
      local stage = services.ReplicatedStorage:FindFirstChild("AIStudioArtifacts")
        :FindFirstChild("OTHER")
      local theirs = stage:GetChildren()[1]

      loader:setProvenance("${PROJECT_A}", "delivery-a")
      local ok, err = pcall(function()
        loader:_loadMetadataArtifact({
          id = "artifact-1", name = "Report", type = "report",
          stage = "OTHER", content = { owner = "a" },
        })
      end)

      return {
        refused = not ok,
        message = tostring(err),
        stillTheirs = string.find(theirs.Value, "b") ~= nil,
        project = theirs:GetAttribute("AIStudioProject"),
      }
    `);

    expect(result).toMatchObject({
      refused: true,
      stillTheirs: true,
      project: PROJECT_B,
    });
  });
});

describe("MAR-002 the loader refuses without provenance", () => {
  it("will not write a script or a metadata value unattributed", async () => {
    const result = await plugin!.run(`
      local ArtifactLoader = require("ArtifactLoader")
      local loader = ArtifactLoader.new()
      local services = _G.__stub.services

      local scriptOk, scriptErr = pcall(function()
        loader:_upsertScript("ServerScriptService/Main.server.lua", "-- generated")
      end)
      local metaOk, metaErr = pcall(function()
        loader:_loadMetadataArtifact({
          id = "artifact-1", name = "Report", type = "report",
          stage = "OTHER", content = { ok = true },
        })
      end)

      return {
        scriptRefused = not scriptOk,
        metaRefused = not metaOk,
        message = tostring(scriptErr),
        created = services.ServerScriptService:FindFirstChild("Main") == nil,
      }
    `);

    // Fail closed. Writing an unattributed instance would create exactly the
    // legacy shape the rules above treat as foreign, so the loader would be
    // manufacturing work nothing could ever claim.
    expect(result).toMatchObject({
      scriptRefused: true,
      metaRefused: true,
      created: true,
    });
  });
});
