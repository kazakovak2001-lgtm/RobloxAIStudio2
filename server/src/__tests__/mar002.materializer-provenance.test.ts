/**
 * MAR-002 — managed says AI Studio made it, not that this project did.
 *
 * The replace path is already right, and this file records that rather than
 * changing it. `materialize` runs an ownership precheck before it constructs
 * anything, so a generated name colliding with hand-built work fails the export
 * instead of destroying it. That guard returns `nil, message` rather than
 * raising, which is worth pinning: a fixture that only checks `pcall` succeeded
 * reads a refusal as a success, and mine did until the harness was instrumented.
 *
 * The sweep is a different question. It removes any managed instance the
 * current delivery did not name, and `isManaged` is one boolean. A place file
 * that has hosted two projects holds managed screens from both, so the second
 * project's export sweeps the first's as orphans of its own.
 *
 * `materialize(content, stageFolder)` cannot do better, because no project
 * identity reaches it. The invariant is not merely unenforced — it is
 * unrepresentable, which is why this file establishes the behaviour and stops
 * rather than working around it.
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
 * `deliver` returns the materializer's own two values, so a refusal is visible
 * as a refusal. Delivering more than one screen at once is how a real export
 * arrives, and is what makes a sweep observable.
 */
function withUi(body: string) {
  return plugin!.run(`
    local UITreeMaterializer = require("UITreeMaterializer")
    local stage = Instance.new("Folder")
    stage.Name = "UI"
    stage.Parent = _G.__stub.services.StarterGui

    local function deliver(...)
      local screens = {}
      for _, name in ipairs({ ... }) do
        table.insert(screens, {
          screenName = name,
          root = { className = "ScreenGui", name = name },
        })
      end
      return UITreeMaterializer.materialize(
        { schemaVersion = 1, screens = screens },
        stage
      )
    end
    ${body}
  `);
}

describe("MAR-002 replace refuses rather than destroys", () => {
  it("refuses to replace a creator's instance and leaves it untouched", async () => {
    const result = await withUi(`
      local creator = Instance.new("ScreenGui")
      creator.Name = "MainMenu"
      creator.Parent = stage

      local delivered, err = deliver("MainMenu")

      return {
        refused = delivered == nil,
        -- The refusal is a returned value, not a raised error. A fixture that
        -- wraps this in pcall and checks only that it did not throw reads the
        -- refusal as a success.
        message = tostring(err),
        alive = not creator:IsDestroyed(),
        childCount = #stage:GetChildren(),
      }
    `);

    expect(result).toMatchObject({ refused: true, alive: true, childCount: 1 });
    expect(String((result as { message: string }).message)).toContain(
      "not managed by AI Studio",
    );
  });

  it("still replaces a screen it delivered before", async () => {
    const result = await withUi(`
      deliver("MainMenu")
      local first = stage:FindFirstChild("MainMenu")
      local delivered = deliver("MainMenu")
      local second = stage:FindFirstChild("MainMenu")
      return {
        delivered = delivered ~= nil,
        replaced = first ~= second,
        firstDestroyed = first:IsDestroyed(),
        managed = second:GetAttribute("AIStudioManaged") == true,
      }
    `);

    // The positive control for replace. Without it, "the creator's screen
    // survived" would also hold for a materializer that never replaces
    // anything.
    expect(result).toMatchObject({
      delivered: true,
      replaced: true,
      firstDestroyed: true,
      managed: true,
    });
  });
});

describe("MAR-002 sweep cannot tell one project's output from another's", () => {
  it("sweeps a managed screen that a different delivery created", async () => {
    const result = await withUi(`
      -- Stands in for an earlier export by another project into the same place
      -- file. Nothing distinguishes it from this project's output, because
      -- nothing records which project made it.
      deliver("OtherProjectScreen")
      local other = stage:FindFirstChild("OtherProjectScreen")

      deliver("MainMenu")

      return {
        otherDestroyed = other:IsDestroyed(),
        remaining = #stage:GetChildren(),
      }
    `);

    // Baseline, and the defect: the earlier screen is gone. Recorded as it is
    // rather than asserted to be wrong, because the materializer has no project
    // identity with which to behave differently.
    expect(result).toMatchObject({ otherDestroyed: true, remaining: 1 });
  });

  it("sweeps its own screen once the delivery stops naming it", async () => {
    const result = await withUi(`
      deliver("Obsolete", "Kept")
      local obsolete = stage:FindFirstChild("Obsolete")

      deliver("Kept")

      return {
        swept = obsolete:IsDestroyed(),
        kept = stage:FindFirstChild("Kept") ~= nil,
      }
    `);

    // The positive control for the sweep: it does run, and correctly, when the
    // instances really are this delivery's to remove.
    expect(result).toMatchObject({ swept: true, kept: true });
  });

  it("takes no project identity, so it cannot scope the sweep", async () => {
    const source = await plugin!.run(`
      return "checked"
    `);
    expect(source).toBe("checked");

    // Stated as a fact about the contract rather than inferred from behaviour:
    // materialize receives content and a stage folder, and content carries
    // screens only. There is no argument, and no field, that says which project
    // this delivery belongs to.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const lua = readFileSync(
      resolve(process.cwd(), "studio-plugin/src/utils/UITreeMaterializer.lua"),
      "utf8",
    );
    expect(lua).toContain(
      "function UITreeMaterializer.materialize(content, stageFolder)",
    );
    expect(lua).not.toContain("projectId");
  });
});
