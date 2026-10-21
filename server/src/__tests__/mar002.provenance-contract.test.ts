/**
 * MAR-002 — a managed instance belongs to a project, not merely to AI Studio.
 *
 * `AIStudioManaged` answers whether AI Studio made an instance. Every
 * destructive decision needs the next answer too: whether it made it for *this*
 * project. Without that, a place file that has hosted two projects loses the
 * first project's work to the second project's export, and the plugin cannot
 * tell the difference because nothing records one.
 *
 * The contract therefore carries a project and the delivery that produced the
 * instance, stamped when it is created and required before it is replaced or
 * swept. A managed instance from another project is treated exactly as
 * hand-built work already is: refused, not overwritten.
 *
 * Instances marked by a build from before this change carry no project. They
 * are treated as foreign. Guessing that an unattributed instance is probably
 * ours is the permissive direction, and the permissive direction is the finding.
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

/**
 * `deliver(projectId, delivery, ...names)` runs one export. It returns the
 * materializer's own two values so a refusal stays visible as a refusal: the
 * guard answers with a message rather than raising, and a fixture that only
 * checks `pcall` reads that as success.
 */
function withUi(body: string) {
  return plugin!.run(`
    local UITreeMaterializer = require("UITreeMaterializer")
    local stage = Instance.new("Folder")
    stage.Name = "UI"
    stage.Parent = _G.__stub.services.StarterGui

    local function deliver(projectId, delivery, ...)
      local screens = {}
      for _, name in ipairs({ ... }) do
        table.insert(screens, {
          screenName = name,
          root = { className = "ScreenGui", name = name },
        })
      end
      return UITreeMaterializer.materialize(
        { schemaVersion = 1, screens = screens },
        stage,
        { projectId = projectId, deliveryId = delivery }
      )
    end
    ${body}
  `);
}

describe("MAR-002 provenance is stamped and required", () => {
  it("stamps the project and the delivery on what it creates", async () => {
    const result = await withUi(`
      deliver("${PROJECT_A}", "delivery-1", "MainMenu")
      local screen = stage:FindFirstChild("MainMenu")
      return {
        managed = screen:GetAttribute("AIStudioManaged"),
        project = screen:GetAttribute("AIStudioProject"),
        delivery = screen:GetAttribute("AIStudioDelivery"),
      }
    `);

    expect(result).toMatchObject({
      managed: true,
      project: PROJECT_A,
      delivery: "delivery-1",
    });
  });

  it("lets a project update its own instance", async () => {
    const result = await withUi(`
      deliver("${PROJECT_A}", "delivery-1", "MainMenu")
      local first = stage:FindFirstChild("MainMenu")
      local delivered, err = deliver("${PROJECT_A}", "delivery-2", "MainMenu")
      local second = stage:FindFirstChild("MainMenu")
      return {
        delivered = delivered ~= nil,
        err = tostring(err),
        replaced = first ~= second,
        firstDestroyed = first:IsDestroyed(),
        delivery = second and second:GetAttribute("AIStudioDelivery"),
      }
    `);

    // Ownership must not become paralysis. This is the case that has to keep
    // working, and it is what makes the refusals below meaningful.
    expect(result).toMatchObject({
      delivered: true,
      replaced: true,
      firstDestroyed: true,
      delivery: "delivery-2",
    });
  });

  it("lets a project sweep its own instance once it stops delivering it", async () => {
    const result = await withUi(`
      deliver("${PROJECT_A}", "delivery-1", "Obsolete", "Kept")
      local obsolete = stage:FindFirstChild("Obsolete")
      deliver("${PROJECT_A}", "delivery-2", "Kept")
      return {
        swept = obsolete:IsDestroyed(),
        kept = stage:FindFirstChild("Kept") ~= nil,
      }
    `);

    expect(result).toMatchObject({ swept: true, kept: true });
  });
});

describe("MAR-002 another project's work is foreign work", () => {
  it("does not sweep an instance belonging to another project", async () => {
    const result = await withUi(`
      deliver("${PROJECT_B}", "delivery-b", "ProjectBScreen")
      local theirs = stage:FindFirstChild("ProjectBScreen")

      deliver("${PROJECT_A}", "delivery-a", "MainMenu")

      return {
        survived = not theirs:IsDestroyed(),
        stillThere = stage:FindFirstChild("ProjectBScreen") ~= nil,
      }
    `);

    expect(result).toMatchObject({ survived: true, stillThere: true });
  });

  it("refuses to replace an instance belonging to another project", async () => {
    const result = await withUi(`
      deliver("${PROJECT_B}", "delivery-b", "Shared")
      local theirs = stage:FindFirstChild("Shared")

      local delivered, err = deliver("${PROJECT_A}", "delivery-a", "Shared")

      return {
        refused = delivered == nil,
        message = tostring(err),
        survived = not theirs:IsDestroyed(),
        project = theirs:GetAttribute("AIStudioProject"),
      }
    `);

    // The same answer hand-built work already gets: refuse the export rather
    // than take the instance.
    expect(result).toMatchObject({
      refused: true,
      survived: true,
      project: PROJECT_B,
    });
  });
});

describe("MAR-002 unattributed instances are not claimed", () => {
  it("treats a managed instance with no project as foreign", async () => {
    const result = await withUi(`
      -- What a build from before this change leaves behind: the mark, and
      -- nothing saying whose it is.
      local legacy = Instance.new("ScreenGui")
      legacy.Name = "LegacyScreen"
      legacy:SetAttribute("AIStudioManaged", true)
      legacy.Parent = stage

      local delivered, err = deliver("${PROJECT_A}", "delivery-a", "LegacyScreen")

      return {
        refused = delivered == nil,
        message = tostring(err),
        survived = not legacy:IsDestroyed(),
      }
    `);

    expect(result).toMatchObject({ refused: true, survived: true });
  });

  it("does not sweep a managed instance with no project", async () => {
    const result = await withUi(`
      local legacy = Instance.new("ScreenGui")
      legacy.Name = "LegacyScreen"
      legacy:SetAttribute("AIStudioManaged", true)
      legacy.Parent = stage

      deliver("${PROJECT_A}", "delivery-a", "MainMenu")

      return { survived = not legacy:IsDestroyed() }
    `);

    // Sweeping it would be claiming it. Nothing in the place file says it is
    // this project's, and inferring that it probably is would be the permissive
    // guess this finding is about.
    expect(result).toMatchObject({ survived: true });
  });

  it("refuses to materialize at all without a project and delivery", async () => {
    const result = await plugin!.run(`
      local UITreeMaterializer = require("UITreeMaterializer")
      local stage = Instance.new("Folder")
      stage.Name = "UI"
      stage.Parent = _G.__stub.services.StarterGui

      local content = { schemaVersion = 1, screens = {
        { screenName = "MainMenu", root = { className = "ScreenGui", name = "MainMenu" } } } }

      local none, noneErr = UITreeMaterializer.materialize(content, stage)
      local blank, blankErr = UITreeMaterializer.materialize(content, stage,
        { projectId = "", deliveryId = "d" })

      return {
        refusedMissing = none == nil,
        refusedBlank = blank == nil,
        message = tostring(noneErr),
        created = #stage:GetChildren(),
      }
    `);

    // Fail closed. Defaulting an absent project to something permissive would
    // put every ownership decision below back on "managed is enough", which is
    // the defect the contract exists to remove.
    expect(result).toMatchObject({
      refusedMissing: true,
      refusedBlank: true,
      created: 0,
    });
  });

  it("still refuses to touch hand-built work", async () => {
    const result = await withUi(`
      local creator = Instance.new("ScreenGui")
      creator.Name = "MainMenu"
      creator.Parent = stage

      local delivered, err = deliver("${PROJECT_A}", "delivery-a", "MainMenu")

      return {
        refused = delivered == nil,
        message = tostring(err),
        alive = not creator:IsDestroyed(),
      }
    `);

    // The behaviour that was already correct, kept correct.
    expect(result).toMatchObject({ refused: true, alive: true });
    expect(String((result as { message: string }).message)).toContain(
      "not managed by AI Studio",
    );
  });
});
