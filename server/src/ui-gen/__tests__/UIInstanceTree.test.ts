/**
 * STUDIO-2F-A — wire contract and deterministic builder.
 *
 * The determinism suite is not routine coverage. `server/src/ui-gen/types.ts`
 * mints ids with `randomUUID()` and `ArtifactStore.store` does the same, so a
 * single leaked identifier would make byte-identical designs hash differently
 * and re-deliver on every regeneration. These tests are the guard against
 * that, and against a class name outside the allowlist reaching `Instance.new`.
 */

import { describe, it, expect, vi } from "vitest";
import {
  ALLOWED_UI_CLASSES,
  ALLOWED_UI_PROPERTIES,
  MAX_UI_TREE_DEPTH,
  MAX_UI_TREE_NODES,
  PRESERVED_CONTENT_FOLDER,
  UI_TREE_SCHEMA_VERSION,
  assertMaterializableUITree,
  getMaterializableUITreeIssues,
  type MaterializableUITree,
  type UIInstanceNode,
} from "../UIInstanceTreeContract";
import {
  UIInstanceTreeBuilder,
  parseHexColor,
  sanitizeName,
} from "../UIInstanceTreeBuilder";
import { normalizeUIArtifactContent } from "../../studio/artifacts/GenerationArtifactRecorder";

/** The shape UIGeneratorAgent's own fallback produces. */
function agentUiDesign(): Record<string, unknown> {
  return {
    screens: [
      {
        name: "MainHUD",
        type: "hud",
        elements: [
          { id: "health_bar", type: "ProgressBar", label: "Health" },
          { id: "score_display", type: "TextLabel", label: "Score: 0" },
        ],
      },
      {
        name: "MainMenu",
        type: "menu",
        elements: [
          { id: "play_btn", type: "TextButton", label: "Play" },
          { id: "settings_btn", type: "TextButton", label: "Settings" },
        ],
      },
    ],
    components: {
      theme: "fantasy",
      primaryColor: "#1a1a2e",
      accentColor: "#e94560",
    },
  };
}

function validTree(): MaterializableUITree {
  return new UIInstanceTreeBuilder().build(agentUiDesign());
}

function walk(node: UIInstanceNode, visit: (node: UIInstanceNode) => void) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

describe("UIInstanceTreeBuilder determinism", () => {
  it("produces byte-identical content across repeated builds", () => {
    const first = JSON.stringify(
      new UIInstanceTreeBuilder().build(agentUiDesign()),
    );
    const second = JSON.stringify(
      new UIInstanceTreeBuilder().build(agentUiDesign()),
    );

    expect(first).toBe(second);
  });

  it("emits no identifier resembling a UUID or a ui-gen id", () => {
    const serialized = JSON.stringify(validTree());

    expect(serialized).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(serialized).not.toMatch(/"ui-[0-9a-f]{8}"/i);
    expect(serialized).not.toContain('"id"');
  });

  it("derives LayoutOrder from position rather than from the model", () => {
    const tree = validTree();
    const menu = tree.screens.find((s) => s.screenName === "MainMenu");
    const container = menu!.root.children![0];
    const buttons = container.children!.filter(
      (child) => child.className === "TextButton",
    );

    expect(buttons.map((b) => b.properties!.LayoutOrder)).toEqual([
      { kind: "int", value: 1 },
      { kind: "int", value: 2 },
    ]);
  });

  it("keys screens by name and never by artifact id", () => {
    expect(validTree().screens.map((s) => s.screenName)).toEqual([
      "MainHUD",
      "MainMenu",
    ]);
  });

  it("carries theme colours as 0-255 integers so JSON round-trips exactly", () => {
    const tree = validTree();
    const container = tree.screens[0].root.children![0];

    expect(container.properties!.BackgroundColor3).toEqual({
      kind: "color3",
      r: 26,
      g: 26,
      b: 46,
    });

    const roundTripped = JSON.parse(JSON.stringify(tree));
    expect(roundTripped).toEqual(tree);
  });

  it("builds only allowlisted classes, and never a script class", () => {
    const seen: string[] = [];
    for (const screen of validTree().screens) {
      walk(screen.root, (node) => seen.push(node.className));
    }

    expect(seen.length).toBeGreaterThan(0);
    for (const className of seen) {
      expect(ALLOWED_UI_CLASSES).toContain(className);
    }
    expect(seen).not.toContain("Script");
    expect(seen).not.toContain("LocalScript");
    expect(seen).not.toContain("ModuleScript");
  });

  it("degrades an unknown element type to a label instead of failing", () => {
    const tree = new UIInstanceTreeBuilder().build({
      screens: [
        {
          name: "Odd",
          type: "menu",
          elements: [{ id: "thing", type: "HoloProjector", label: "Beam" }],
        },
      ],
    });

    const container = tree.screens[0].root.children![0];
    const element = container.children!.find((c) => c.name === "thing");
    expect(element!.className).toBe("TextLabel");
    expect(element!.properties!.Text).toEqual({
      kind: "string",
      value: "Beam",
    });
  });

  it("de-duplicates colliding screen and element names deterministically", () => {
    const tree = new UIInstanceTreeBuilder().build({
      screens: [
        { name: "HUD", type: "hud", elements: [{ id: "a", label: "A" }] },
        {
          name: "HUD",
          type: "hud",
          elements: [
            { id: "dup", label: "One" },
            { id: "dup", label: "Two" },
          ],
        },
      ],
    });

    expect(tree.screens.map((s) => s.screenName)).toEqual(["HUD", "HUD 2"]);
    const container = tree.screens[1].root.children![0];
    expect(container.children!.map((c) => c.name)).toEqual([
      "Layout",
      "Padding",
      "dup",
      "dup 2",
    ]);
  });

  it("rejects a design with no screens", () => {
    expect(() => new UIInstanceTreeBuilder().build({ screens: [] })).toThrow(
      /at least one screen/,
    );
  });
});

describe("assertMaterializableUITree fail-closed table", () => {
  it("accepts a tree the builder produced", () => {
    expect(() => assertMaterializableUITree(validTree())).not.toThrow();
    expect(getMaterializableUITreeIssues(validTree())).toEqual([]);
  });

  it("rejects an unknown class", () => {
    const tree = validTree();
    (tree.screens[0].root.children![0] as { className: string }).className =
      "Script";

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("outside the allowlist"),
    );
  });

  it("rejects an unknown property", () => {
    const tree = validTree();
    tree.screens[0].root.children![0].properties!.Source = {
      kind: "string",
      value: "print('pwned')",
    };

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("property outside the allowlist: Source"),
    );
  });

  it("rejects a property carrying the wrong value kind", () => {
    const tree = validTree();
    tree.screens[0].root.children![0].properties!.Size = {
      kind: "string",
      value: "big",
    } as never;

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("must have kind udim2"),
    );
  });

  it("rejects an unknown value kind", () => {
    const tree = validTree();
    tree.screens[0].root.children![0].properties!.Size = {
      kind: "rect",
      value: [0, 0, 1, 1],
    } as never;

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("must have kind udim2"),
    );
  });

  it("rejects an unknown enum item", () => {
    const tree = validTree();
    const container = tree.screens[1].root.children![0];
    const button = container.children!.find(
      (c) => c.className === "TextButton",
    );
    button!.properties!.Font = {
      kind: "enum",
      enumName: "Font",
      item: "NotARealFont",
    };

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("unknown Font item NotARealFont"),
    );
  });

  it("rejects an enum name that does not match its property", () => {
    const tree = validTree();
    const container = tree.screens[1].root.children![0];
    const button = container.children!.find(
      (c) => c.className === "TextButton",
    );
    button!.properties!.Font = {
      kind: "enum",
      enumName: "Material",
      item: "Neon",
    };

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("must use enum Font, received Material"),
    );
  });

  /**
   * Both names are allowlisted here, so only the property binding rejects it.
   * Without that check this passes validation and then raises on assignment in
   * Studio, where the message is far less precise. Found in review.
   */
  it("rejects a mismatched enum even when both names are allowlisted", () => {
    const tree = validTree();
    const container = tree.screens[1].root.children![0];
    const button = container.children!.find(
      (c) => c.className === "TextButton",
    );
    button!.properties!.Font = {
      kind: "enum",
      enumName: "SortOrder",
      item: "Name",
    };

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("must use enum Font, received SortOrder"),
    );
  });

  it("rejects an integer outside the 32-bit range", () => {
    const tree = validTree();
    tree.screens[0].root.children![0].properties!.ZIndex = {
      kind: "int",
      value: 1e300,
    };

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("must carry a 32-bit integer"),
    );
  });

  it("rejects the reserved preservation folder name", () => {
    const tree = validTree();
    tree.screens[0].root.children![0].name = PRESERVED_CONTENT_FOLDER;

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("reserved name AIStudioPreserved"),
    );
  });

  it("rejects a colour channel outside 0-255 or non-integer", () => {
    const tree = validTree();
    tree.screens[0].root.children![0].properties!.BackgroundColor3 = {
      kind: "color3",
      r: 0.5,
      g: 0,
      b: 0,
    };

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("integer r/g/b in 0-255"),
    );
  });

  it("rejects a duplicate sibling name", () => {
    const tree = validTree();
    const container = tree.screens[0].root.children![0];
    container.children!.push({ ...container.children![0] });

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("duplicate child name"),
    );
  });

  it("rejects illegal name characters", () => {
    const tree = validTree();
    tree.screens[0].root.children![0].name = "Container/Evil";

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("requires a valid instance name"),
    );
  });

  it("rejects a non-ScreenGui root", () => {
    const tree = validTree();
    (tree.screens[0].root as { className: string }).className = "Frame";

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("root must be a ScreenGui"),
    );
  });

  it("rejects a root whose name does not match its screenName", () => {
    const tree = validTree();
    tree.screens[0].root.name = "SomethingElse";

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("root name must equal screenName"),
    );
  });

  it("rejects a duplicate screenName", () => {
    const tree = validTree();
    tree.screens[1].screenName = tree.screens[0].screenName;

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("duplicate screenName"),
    );
  });

  it("rejects excessive depth", () => {
    const tree = validTree();
    let node: UIInstanceNode = tree.screens[0].root;
    for (let i = 0; i < MAX_UI_TREE_DEPTH + 2; i++) {
      const child: UIInstanceNode = { className: "Frame", name: `Deep${i}` };
      node.children = [child];
      node = child;
    }

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("exceeds the maximum depth"),
    );
  });

  it("rejects exceeding the instance budget", () => {
    const tree = validTree();
    const container = tree.screens[0].root.children![0];
    container.children = Array.from(
      { length: MAX_UI_TREE_NODES + 5 },
      (_, i) => ({ className: "Frame" as const, name: `Filler${i}` }),
    );

    expect(getMaterializableUITreeIssues(tree)).toContainEqual(
      expect.stringContaining("instance budget"),
    );
  });

  it("rejects a wrong or missing schemaVersion without inspecting further", () => {
    expect(getMaterializableUITreeIssues({ screens: [] })).toContainEqual(
      expect.stringContaining("schemaVersion must be"),
    );
    expect(
      getMaterializableUITreeIssues({
        schemaVersion: UI_TREE_SCHEMA_VERSION + 1,
        screens: [],
      }),
    ).toContainEqual(expect.stringContaining("schemaVersion must be"));
  });

  it("never allows a property list to contain Source on any class", () => {
    for (const className of ALLOWED_UI_CLASSES) {
      expect(Object.keys(ALLOWED_UI_PROPERTIES[className])).not.toContain(
        "Source",
      );
    }
  });
});

describe("GenerationArtifactRecorder UI branch", () => {
  it("records the schema version, screens and the original design", () => {
    const content = normalizeUIArtifactContent({ uiDesign: agentUiDesign() });

    expect(content.schemaVersion).toBe(UI_TREE_SCHEMA_VERSION);
    expect(Array.isArray(content.screens)).toBe(true);
    // The abstract design is retained so a later schema can re-derive a tree
    // without re-running generation.
    expect(content.uiDesign).toEqual(agentUiDesign());
  });

  it("rejects output that is not an object at all", () => {
    expect(() => normalizeUIArtifactContent(null)).toThrow(/must be an object/);
  });

  /**
   * Fail-closed on the claim, not on the generation. A model returning
   * `{"uiDesign": {}}` satisfies UIGeneratorAgent's only required key and
   * reaches the recorder with zero screens; throwing here would discard a
   * working Lua package over an unbuildable menu.
   */
  it.each([
    ["a missing design", {}],
    ["a non-object design", { uiDesign: "a lovely menu" }],
    ["a design with no screens", { uiDesign: { screens: [] } }],
  ])("degrades %s to the legacy path instead of failing", (_label, output) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const content = normalizeUIArtifactContent(output);

    // No schemaVersion means no claim, so the plugin takes the StringValue
    // path and verification can never accept an unbuilt tree.
    expect(content.schemaVersion).toBeUndefined();
    expect(content.screens).toBeUndefined();
    expect(content).toEqual(output);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("never interpolates model-derived design content into the log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    normalizeUIArtifactContent({
      uiDesign: { screens: [], marker: "INJECTED\r\nFAKE LOG LINE" },
    });

    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).not.toContain("INJECTED");
    expect(logged).not.toMatch(/[\r\n]/);

    warn.mockRestore();
  });

  it("is deterministic through the recorder boundary", () => {
    const first = JSON.stringify(
      normalizeUIArtifactContent({ uiDesign: agentUiDesign() }),
    );
    const second = JSON.stringify(
      normalizeUIArtifactContent({ uiDesign: agentUiDesign() }),
    );

    expect(first).toBe(second);
  });
});

describe("naming and colour helpers", () => {
  it("strips path separators and control characters from names", () => {
    expect(sanitizeName("Main/HUD", "Fallback")).toBe("MainHUD");
    expect(sanitizeName("  ", "Fallback")).toBe("Fallback");
    expect(sanitizeName(42, "Fallback")).toBe("Fallback");
    expect(sanitizeName("a".repeat(80), "Fallback")).toHaveLength(50);
  });

  it("parses hex colours and rejects anything else", () => {
    expect(parseHexColor("#1a1a2e")).toEqual({ r: 26, g: 26, b: 46 });
    expect(parseHexColor("1a1a2e")).toEqual({ r: 26, g: 26, b: 46 });
    expect(parseHexColor("#fff")).toBeNull();
    expect(parseHexColor("rebeccapurple")).toBeNull();
    expect(parseHexColor(null)).toBeNull();
  });
});
