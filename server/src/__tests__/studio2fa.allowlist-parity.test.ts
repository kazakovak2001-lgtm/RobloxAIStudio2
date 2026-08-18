/**
 * STUDIO-2F-A — cross-language allowlist parity.
 *
 * The plugin deliberately carries its own copy of the class, property and enum
 * allowlists rather than trusting the backend, because it is the side that
 * actually calls `Instance.new`. Nothing else prevents the two lists from
 * drifting apart, and drift means either silent rejection in Studio or an
 * unguarded class reaching `Instance.new`. This test reads the Lua source as
 * text and asserts set equality with the TypeScript constants.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import {
  ALLOWED_UI_CLASSES,
  ALLOWED_UI_ENUM_ITEMS,
  ALLOWED_UI_PROPERTIES,
  MAX_UI_TREE_DEPTH,
  MAX_UI_TREE_NODES,
  UI_TREE_SCHEMA_VERSION,
  type AllowedUIClass,
} from "../ui-gen/UIInstanceTreeContract";

const MATERIALIZER = readFileSync(
  join(process.cwd(), "studio-plugin/src/utils/UITreeMaterializer.lua"),
  "utf8",
);

/** Extract a block the Lua source marks with BEGIN/END sentinel comments. */
function luaBlock(marker: string): string {
  const pattern = new RegExp(
    `-- ${marker}_BEGIN\\r?\\n([\\s\\S]*?)-- ${marker}_END`,
  );
  const match = pattern.exec(MATERIALIZER);
  if (!match)
    throw new Error(`Missing ${marker} block in UITreeMaterializer.lua`);
  return match[1];
}

/** `Key = true,` entries at any nesting level within a block. */
function luaBooleanKeys(block: string): string[] {
  return [...block.matchAll(/([A-Za-z0-9_]+)\s*=\s*true/g)].map((m) => m[1]);
}

/**
 * Extract the entries of the single outer Lua table in a block, keyed by name,
 * by matching braces rather than by regex. The Lua file mixes multi-line and
 * single-line table styles, and a regex that copes with both is fragile enough
 * to produce a false pass — which for a security allowlist is worse than no
 * test at all.
 */
function luaOuterTableEntries(block: string): Record<string, string> {
  const open = block.indexOf("{");
  if (open === -1) throw new Error("Block contains no table");

  const entries: Record<string, string> = {};
  let depth = 0;
  let index = open;
  let pendingKey: string | null = null;
  let bodyStart = 0;

  while (index < block.length) {
    const char = block[index];

    if (char === "{") {
      depth++;
      if (depth === 2 && pendingKey) bodyStart = index + 1;
    } else if (char === "}") {
      if (depth === 2 && pendingKey) {
        entries[pendingKey] = block.slice(bodyStart, index);
        pendingKey = null;
      }
      depth--;
      if (depth === 0) break;
    } else if (depth === 1) {
      const keyMatch = /^([A-Za-z0-9_]+)\s*=\s*\{/.exec(block.slice(index));
      if (keyMatch) {
        pendingKey = keyMatch[1];
        index += keyMatch[0].length - 1;
        continue;
      }
    }

    index++;
  }

  return entries;
}

/** Parse `ClassName = { Prop = "kind", ... }` tables. */
function luaPropertyTables(
  block: string,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const [className, body] of Object.entries(luaOuterTableEntries(block))) {
    const properties: Record<string, string> = {};
    for (const entry of body.matchAll(/([A-Za-z0-9_]+)\s*=\s*"([a-z0-9]+)"/g)) {
      properties[entry[1]] = entry[2];
    }
    result[className] = properties;
  }

  return result;
}

/** Parse `EnumName = { Item = true, ... }` tables. */
function luaEnumTables(block: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const [enumName, body] of Object.entries(luaOuterTableEntries(block))) {
    result[enumName] = luaBooleanKeys(body);
  }

  return result;
}

describe("STUDIO-2F-A allowlist parity between TypeScript and Lua", () => {
  it("agrees on the class allowlist exactly", () => {
    const luaClasses = luaBooleanKeys(luaBlock("ALLOWED_CLASSES"));

    expect([...luaClasses].sort()).toEqual([...ALLOWED_UI_CLASSES].sort());
  });

  it("agrees on every per-class property name and value kind", () => {
    const luaProperties = luaPropertyTables(luaBlock("ALLOWED_PROPERTIES"));

    expect(Object.keys(luaProperties).sort()).toEqual(
      [...ALLOWED_UI_CLASSES].sort(),
    );

    for (const className of ALLOWED_UI_CLASSES) {
      expect(luaProperties[className]).toEqual(
        ALLOWED_UI_PROPERTIES[className as AllowedUIClass],
      );
    }
  });

  it("agrees on every enum and its items", () => {
    const luaEnums = luaEnumTables(luaBlock("ALLOWED_ENUM_ITEMS"));

    expect(Object.keys(luaEnums).sort()).toEqual(
      Object.keys(ALLOWED_UI_ENUM_ITEMS).sort(),
    );

    for (const [enumName, items] of Object.entries(ALLOWED_UI_ENUM_ITEMS)) {
      expect([...luaEnums[enumName]].sort()).toEqual([...items].sort());
    }
  });

  it("agrees on the schema version and the caps", () => {
    expect(MATERIALIZER).toContain(
      `UITreeMaterializer.SCHEMA_VERSION = ${UI_TREE_SCHEMA_VERSION}`,
    );
    expect(MATERIALIZER).toContain(
      `UITreeMaterializer.MAX_DEPTH = ${MAX_UI_TREE_DEPTH}`,
    );
    expect(MATERIALIZER).toContain(
      `UITreeMaterializer.MAX_NODES = ${MAX_UI_TREE_NODES}`,
    );
  });

  it("never allows a script class or a Source property on the Lua side", () => {
    const classes = luaBooleanKeys(luaBlock("ALLOWED_CLASSES"));
    expect(classes).not.toContain("Script");
    expect(classes).not.toContain("LocalScript");
    expect(classes).not.toContain("ModuleScript");

    const properties = luaPropertyTables(luaBlock("ALLOWED_PROPERTIES"));
    for (const table of Object.values(properties)) {
      expect(Object.keys(table)).not.toContain("Source");
    }
  });
});

describe("STUDIO-2F-A plugin materialization contract", () => {
  it("validates the whole tree before constructing anything", () => {
    // The validate pass must run before the build pass, so a rejected tree
    // never reaches Instance.new. SyncManager does not roll back on failure.
    const validateIndex = MATERIALIZER.indexOf(
      "local ok, err = UITreeMaterializer.validate(content)",
    );
    const buildIndex = MATERIALIZER.indexOf("local buildOk, buildErr = pcall");

    expect(validateIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(validateIndex);
  });

  it("builds detached and destroys anything built when a build fails", () => {
    expect(MATERIALIZER).toContain("if not buildOk then");
    expect(MATERIALIZER).toContain("if not attachOk then");
    expect(MATERIALIZER).toContain("entry.root:Destroy()");
    // Roots are parented only after every screen has been constructed.
    expect(
      MATERIALIZER.indexOf("entry.root.Parent = stageFolder"),
    ).toBeGreaterThan(MATERIALIZER.indexOf("local buildOk, buildErr = pcall"));
  });

  it("refuses to replace an instance it does not own", () => {
    expect(MATERIALIZER).toContain(
      // MAR-002 narrowed this to isOwnedBy, which requires the managed mark AND a
      // matching project. That is strictly stronger: managed alone let one
      // project's export destroy another's work. Behaviour is proved in
      // server/src/__tests__/mar002.provenance-contract.test.ts.
      "if existing and not isOwnedBy(existing, provenance.projectId) then",
    );
    expect(MATERIALIZER).toContain("is not managed by AI Studio");
  });

  it("marks what it creates", () => {
    expect(MATERIALIZER).toContain(
      "instance:SetAttribute(MANAGED_ATTRIBUTE, true)",
    );
    expect(MATERIALIZER).toContain(
      'local MANAGED_ATTRIBUTE = "AIStudioManaged"',
    );
    expect(MATERIALIZER).toContain('local DELIVERY_MODE = "design-time"');
  });

  /**
   * Review found that walking only direct children lost creator work: an
   * instance added inside a generated container is a grandchild of the screen,
   * and destroying the screen took it along. Preservation must recurse.
   */
  it("rescues creator content at any depth, not only direct children", () => {
    expect(MATERIALIZER).toContain(
      "local function collectUnmanagedDescendants(instance, found)",
    );
    // Recursion continues through managed nodes and stops at unmanaged ones,
    // so a creator's own subtree moves as a single piece.
    expect(MATERIALIZER).toContain("collectUnmanagedDescendants(child, found)");
    expect(MATERIALIZER).toContain(
      'local PRESERVED_FOLDER = "AIStudioPreserved"',
    );
    // The reserved folder name must be unusable by generated content, or a
    // delivery could collide with the container protecting creator work.
    expect(MATERIALIZER).toContain(
      "if name == PRESERVED_FOLDER then return false end",
    );
  });

  it("preserves creator content on both replacement and sweep", () => {
    const replaceIndex = MATERIALIZER.indexOf(
      "preserveUnmanagedContent(existing, entry.root)",
    );
    const sweepIndex = MATERIALIZER.indexOf(
      "preserveUnmanagedContent(child, stageFolder)",
    );

    expect(replaceIndex).toBeGreaterThan(-1);
    expect(sweepIndex).toBeGreaterThan(-1);
    // Rescue must happen before the destroy in both paths.
    expect(MATERIALIZER.indexOf("existing:Destroy()")).toBeGreaterThan(
      replaceIndex,
    );
    expect(MATERIALIZER.indexOf("child:Destroy()")).toBeGreaterThan(sweepIndex);
  });

  it("guards the attach phase and discards roots that never attached", () => {
    expect(MATERIALIZER).toContain("local attachOk, attachErr = pcall");
    expect(MATERIALIZER).toContain("if not attachOk then");
    expect(MATERIALIZER).toContain("if not entry.attached then");
  });

  it("binds an enum value to its property and bounds integers", () => {
    expect(MATERIALIZER).toContain("if value.enumName ~= property then");
    expect(MATERIALIZER).toContain("local MAX_SAFE_INT = 2147483647");
    expect(MATERIALIZER).toContain('return "must carry a 32-bit integer"');
  });

  it("sweeps only screens it manages", () => {
    expect(MATERIALIZER).toContain("if isOwnedBy(child, provenance.projectId)");
  });
});

describe("STUDIO-2F-A ArtifactLoader routing", () => {
  const LOADER = readFileSync(
    join(process.cwd(), "studio-plugin/src/utils/ArtifactLoader.lua"),
    "utf8",
  );

  it("routes ui-layout content that claims a schema version to the tree path", () => {
    expect(LOADER).toContain(
      'if artifact.type == "ui-layout" and self:_claimsUITreeSchema(artifact.content) then',
    );
  });

  it("treats absence of schemaVersion as the only fallback trigger", () => {
    expect(LOADER).toContain("content.schemaVersion ~= nil");
    // Claimed-but-invalid content must error rather than fall through, so the
    // StringValue path is never reached once a version is claimed.
    expect(LOADER).toContain("error(err, 0)");
  });

  it("returns identity-bearing screen receipts", () => {
    expect(LOADER).toContain("screens = delivered");
  });

  /**
   * ARTIFACT-1. Naming a metadata instance after `artifact.id` made delivery
   * non-idempotent, because `ArtifactStore` mints that id with `randomUUID`
   * on every store. The stage-derived name is the stable identity.
   */
  it("names metadata instances by their stable artifact name", () => {
    expect(LOADER).toContain(
      "function ArtifactLoader:_metadataInstanceName(artifact)",
    );
    expect(LOADER).toContain(
      "local valueName = self:_metadataInstanceName(artifact)",
    );
    // The id remains only as the fallback when a backend sends no name.
    expect(LOADER).toContain("return tostring(artifact.id)");
  });

  it("clears instances left by the previous id-based identity", () => {
    expect(LOADER).toContain(
      "function ArtifactLoader:_removeLegacyIdNamedValues(stageFolder)",
    );
    // Narrow by construction: only a StringValue whose Name equals its own
    // ArtifactId attribute qualifies, so hand-added instances and
    // materialized UI trees cannot be caught.
    expect(LOADER).toContain(
      'local recordedId = child:GetAttribute("ArtifactId")',
    );
    expect(LOADER).toContain("recordedId == child.Name");
  });

  /**
   * Review found the sweep would delete a value this loader had just written
   * under the id fallback, because such a value matches its own migration
   * rule. A second metadata artifact in the same stage folder would then
   * destroy the first.
   */
  it("never sweeps a value it currently manages", () => {
    expect(LOADER).toContain(
      'child:IsA("StringValue") and child:GetAttribute("AIStudioManaged") ~= true',
    );
  });

  /**
   * Review also found the migration was unreachable for the case that needed
   * it most: a UI artifact delivered before `schemaVersion` existed left an
   * id-named StringValue, and once the backend starts sending a tree the UI
   * path runs instead, so a metadata-only cleanup would never see it.
   */
  it("runs the migration from shared stage-folder setup, not one path", () => {
    const ensureIndex = LOADER.indexOf(
      "function ArtifactLoader:_ensureStageFolder(stage)",
    );
    const sweepCall = LOADER.indexOf(
      "self:_removeLegacyIdNamedValues(stageFolder)",
    );

    expect(ensureIndex).toBeGreaterThan(-1);
    expect(sweepCall).toBeGreaterThan(ensureIndex);
    // Exactly one call site, so neither path can be missed or double-swept.
    expect(
      LOADER.split("self:_removeLegacyIdNamedValues(stageFolder)").length - 1,
    ).toBe(1);
  });

  it("refuses to overwrite a metadata name it does not own", () => {
    expect(LOADER).toContain('value:GetAttribute("AIStudioManaged") ~= true');
    expect(LOADER).toContain('value:SetAttribute("AIStudioManaged", true)');
  });
});
