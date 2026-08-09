import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

import { buildWorldModel } from "../validation/worldModel";
import { buildWorldScene } from "../validation/worldSceneBuilder";
import {
  ALLOWED_WORLD_ATTRIBUTES,
  ALLOWED_WORLD_CLASSES,
  ALLOWED_WORLD_ENUM_ITEMS,
  ALLOWED_WORLD_PROPERTIES,
  MAX_WORLD_SCENE_DEPTH,
  MAX_WORLD_SCENE_NODES,
  WORLD_SCENE_SCHEMA_VERSION,
  carriesMaterializableWorldScene,
  expectedWorldInstancePath,
  worldEntityNodeName,
  type AllowedWorldClass,
} from "../validation/worldSceneContract";
import { getPlayableLuaIssues } from "../types/playableLua";

/**
 * WORLD-1B — the scene contract and its deterministic translation.
 *
 * The scene is design-time only. The playable world is still built by the
 * generated server script into Workspace, and these tests pin that boundary as
 * much as they pin the contract.
 */

const MATERIALIZER = readFileSync(
  join(process.cwd(), "studio-plugin/src/utils/WorldSceneMaterializer.lua"),
  "utf8",
);

/**
 * The materializer with comments removed, for assertions about what the code
 * does rather than what it says.
 */
const MATERIALIZER_CODE = MATERIALIZER.replace(
  /--\[\[[\s\S]*?\]\]|--[^\n]*/g,
  "",
);

/** Extract a block the Lua source marks with BEGIN/END sentinel comments. */
function luaBlock(marker: string): string {
  const pattern = new RegExp(
    `-- ${marker}_BEGIN\\r?\\n([\\s\\S]*?)-- ${marker}_END`,
  );
  const match = pattern.exec(MATERIALIZER);
  if (!match)
    throw new Error(`Missing ${marker} block in WorldSceneMaterializer.lua`);
  return match[1];
}

function racingSources() {
  return {
    gameDesign: {
      gameplay: {
        mechanics: [
          { name: "drifting", description: "Players drift through corners" },
          { name: "boosting", description: "Players spend charge to boost" },
        ],
        balance: {
          winCondition: "Cross the finish line first",
          economyOrScoring: "Lap times converted into placement points",
        },
      },
    },
    architecture: {
      architecture: {
        services: {
          SpawnService: "Places racers on the grid",
          DataService: "Persists best lap times",
        },
        apiContracts: { "Race.LapComplete": { input: "lap", output: "times" } },
      },
    },
  };
}

describe("WORLD-1B translation is deterministic", () => {
  it("produces an identical scene for identical input", () => {
    // Replacement semantics depend on this: the plugin replaces a zone
    // wholesale because the same claims always land in the same place under
    // the same name.
    const first = buildWorldScene(buildWorldModel(racingSources()));
    const second = buildWorldScene(buildWorldModel(racingSources()));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("keeps semantic identity stable across regeneration", () => {
    const first = buildWorldScene(buildWorldModel(racingSources()));
    const second = buildWorldScene(buildWorldModel(racingSources()));

    const ids = (scene: typeof first) =>
      scene.zones.flatMap((zone) =>
        zone.entities.map((entity) => entity.entityId),
      );

    expect(ids(second)).toEqual(ids(first));
    // Derived from the claim, never from a counter or a random id.
    expect(ids(first)).toContain("service-spawnservice");
  });

  it("carries the semantic role and identifier onto the instance", () => {
    const scene = buildWorldScene(buildWorldModel(racingSources()));
    const zone = scene.zones.find((entry) => entry.role === "player-entry");
    const entity = zone?.entities[0];

    expect(entity?.node.attributes?.AIStudioWorldEntityId).toEqual({
      kind: "string",
      value: entity?.entityId,
    });
    expect(entity?.node.attributes?.AIStudioWorldRole).toEqual({
      kind: "string",
      value: "player-entry",
    });
  });

  it("is not shaped around one gameplay pattern", () => {
    // A tycoon and a racer share no gameplay nouns. If the scene only fits one
    // of them, the contract encodes a template rather than a world.
    const racer = buildWorldScene(buildWorldModel(racingSources()));
    const tycoon = buildWorldScene(
      buildWorldModel({
        gameDesign: {
          gameplay: { mechanics: [{ name: "purchasing droppers" }] },
        },
        architecture: {
          architecture: { services: { SaveService: "Persists plot state" } },
        },
      }),
    );

    expect(racer.zones.length).toBeGreaterThan(0);
    expect(tycoon.zones.length).toBeGreaterThan(0);
    // Zone names come from roles, so neither scene contains a gameplay noun.
    const names = [...racer.zones, ...tycoon.zones].map((z) => z.zoneName);
    expect(names.join(" ")).not.toMatch(/spawn|collectible|objective|shop/i);
  });

  it("keeps the whole scene inside the declared limits", () => {
    const scene = buildWorldScene(buildWorldModel(racingSources()));
    const count = scene.zones.reduce(
      (total, zone) =>
        total +
        1 +
        zone.entities.reduce(
          (sum, entity) => sum + 1 + (entity.node.children?.length ?? 0),
          0,
        ),
      0,
    );

    expect(count).toBeLessThanOrEqual(MAX_WORLD_SCENE_NODES);
    expect(scene.sceneVersion).toBe(WORLD_SCENE_SCHEMA_VERSION);
  });
});

describe("WORLD-1B contract forbids executable content", () => {
  it("cannot express any script class", () => {
    for (const forbidden of ["Script", "LocalScript", "ModuleScript"]) {
      expect(ALLOWED_WORLD_CLASSES).not.toContain(forbidden);
      expect(luaBlock("WORLD_CLASSES")).not.toContain(forbidden);
    }
  });

  it("cannot express a Source property on any allowed class", () => {
    for (const className of ALLOWED_WORLD_CLASSES) {
      expect(
        Object.keys(ALLOWED_WORLD_PROPERTIES[className as AllowedWorldClass]),
      ).not.toContain("Source");
    }
    expect(luaBlock("WORLD_PROPERTIES")).not.toContain("Source");
  });

  it("namespaces every attribute it may set", () => {
    for (const attribute of Object.keys(ALLOWED_WORLD_ATTRIBUTES)) {
      expect(attribute.startsWith("AIStudioWorld")).toBe(true);
    }
  });
});

describe("WORLD-1B cross-language allowlist parity", () => {
  it("agrees on the class allowlist", () => {
    const block = luaBlock("WORLD_CLASSES");
    const lua = [...block.matchAll(/^\s{4}(\w+) = true,/gm)].map((m) => m[1]);
    expect(lua.sort()).toEqual([...ALLOWED_WORLD_CLASSES].sort());
  });

  it("agrees on the property allowlist and kinds", () => {
    const block = luaBlock("WORLD_PROPERTIES");
    const parsed: Record<string, Record<string, string>> = {};
    let current: string | null = null;
    for (const line of block.split(/\r?\n/)) {
      const open = /^\s{4}(\w+) = \{/.exec(line);
      if (open) {
        current = open[1];
        parsed[current] = {};
        continue;
      }
      const entry = /^\s{8}(\w+) = "(\w+)",/.exec(line);
      if (entry && current) parsed[current][entry[1]] = entry[2];
    }

    expect(Object.keys(parsed).sort()).toEqual(
      [...ALLOWED_WORLD_CLASSES].sort(),
    );
    for (const className of ALLOWED_WORLD_CLASSES) {
      expect(parsed[className]).toEqual(
        ALLOWED_WORLD_PROPERTIES[className as AllowedWorldClass],
      );
    }
  });

  it("agrees on the enum items", () => {
    const block = luaBlock("WORLD_ENUM_ITEMS");
    const items = [...block.matchAll(/^\s{8}(\w+) = true,/gm)].map((m) => m[1]);
    expect(items.sort()).toEqual([...ALLOWED_WORLD_ENUM_ITEMS.Material].sort());
  });

  it("agrees on the attribute allowlist and kinds", () => {
    const block = luaBlock("WORLD_ATTRIBUTES");
    const parsed: Record<string, string> = {};
    for (const match of block.matchAll(/^\s{4}(\w+) = "(\w+)",/gm)) {
      parsed[match[1]] = match[2];
    }
    expect(parsed).toEqual(ALLOWED_WORLD_ATTRIBUTES);
  });

  it("agrees on the limits and version", () => {
    expect(MATERIALIZER).toContain(
      `WorldSceneMaterializer.SCENE_VERSION = ${WORLD_SCENE_SCHEMA_VERSION}`,
    );
    expect(MATERIALIZER).toContain(
      `WorldSceneMaterializer.MAX_DEPTH = ${MAX_WORLD_SCENE_DEPTH}`,
    );
    expect(MATERIALIZER).toContain(
      `WorldSceneMaterializer.MAX_NODES = ${MAX_WORLD_SCENE_NODES}`,
    );
  });
});

describe("WORLD-1B ownership boundary", () => {
  it("delivers into the design-time hierarchy, never Workspace", () => {
    // The generated server script owns Workspace at run time. A scene placed
    // there would be a second world, which is WORLD-1C, not this slice.
    const path = expectedWorldInstancePath("WORLD_MODEL", "PlayerEntry", "e-1");

    expect(path.startsWith("ReplicatedStorage.AIStudioArtifacts.")).toBe(true);
    expect(path).not.toContain("Workspace");
    // Comments discuss Workspace precisely because the scene stays out of it,
    // so the assertion is against executable source rather than prose.
    expect(MATERIALIZER_CODE).not.toMatch(
      /GetService\s*\(\s*["']Workspace["']/,
    );
    expect(MATERIALIZER_CODE).not.toMatch(/\bworkspace\b/i);
  });

  it("leaves the Lua runtime world contract untouched", () => {
    // Whether a package is playable must not depend on anything this slice
    // added: the world is still the server script's, judged the same way.
    const scripts = [
      {
        path: "ServerScriptService/Arena.server.lua",
        content: "local x = 1\n",
      },
    ];
    const before = getPlayableLuaIssues(scripts);

    expect(before).toContain(
      "server code must create playable world instances",
    );
    expect(before.join(" ")).not.toContain("world scene");
    expect(before.join(" ")).not.toContain("WORLD_MODEL");
  });

  it("recognises a scene only when it carries the current version", () => {
    const model = buildWorldModel(racingSources());
    const scene = buildWorldScene(model);

    expect(carriesMaterializableWorldScene({ ...model, scene })).toBe(true);
    // An older backend sends no scene: the plugin must take the metadata path
    // rather than claim a world was materialized.
    expect(carriesMaterializableWorldScene(model)).toBe(false);
    expect(
      carriesMaterializableWorldScene({
        ...model,
        scene: { ...scene, sceneVersion: 99 },
      }),
    ).toBe(false);
  });

  it("derives instance names from semantic identifiers", () => {
    expect(worldEntityNodeName("service-spawnservice")).toBe(
      "service-spawnservice",
    );
    // A name that could not start an instance name is prefixed rather than
    // silently altered into something the receipt would not match.
    expect(worldEntityNodeName("-leading")).toBe("Entity--leading");
  });
});
