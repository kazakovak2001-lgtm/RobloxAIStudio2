/**
 * FIRST-PLAYABLE-1 (FP-1A). The spatial design contract.
 *
 * What is under test is that the parser reads an agent-produced level and
 * refuses one it cannot trust — never that it can invent a level. There is no
 * fixture here that the production code could fall back to, because the whole
 * point of the slice is that coordinates come from the model.
 */

import { describe, expect, it } from "vitest";
import {
  SPATIAL_DESIGN_SCHEMA_VERSION,
  MAX_SPATIAL_COORDINATE,
  buildSpatialDesign,
  describeSpatialDesign,
  type SpatialDesign,
} from "../validation/spatialDesign";

/** A minimal design that satisfies the contract. Shapes only — no game. */
function validBody() {
  return {
    map: {
      id: "map-1",
      name: "Generated Map",
      type: "main",
      size: { x: 512, y: 128, z: 512 },
      theme: "generated theme",
    },
    zones: [
      {
        id: "zone-start",
        name: "Start",
        type: "safe",
        bounds: { minX: -64, minZ: -64, maxX: 64, maxZ: 64 },
        groundHeight: 8,
      },
      {
        id: "zone-far",
        name: "Far",
        type: "exploration",
        bounds: { minX: 96, minZ: 96, maxX: 224, maxZ: 224 },
      },
    ],
    spawns: [
      {
        id: "spawn-1",
        name: "Start Spawn",
        type: "initial",
        position: { x: 0, y: 10, z: 0 },
      },
    ],
    objects: [
      {
        id: "obj-1",
        name: "Platform",
        objectType: "structure",
        position: { x: 12, y: 4, z: 0 },
        size: { x: 8, y: 1, z: 8 },
        orientation: { x: 0, y: 45, z: 0 },
        material: "Wood",
        zoneId: "zone-start",
      },
    ],
    terrain: [
      {
        id: "terrain-1",
        shape: "block",
        material: "Grass",
        position: { x: 0, y: 0, z: 0 },
        size: { x: 256, y: 16, z: 256 },
      },
    ],
    paths: [
      {
        id: "path-1",
        fromZoneId: "zone-start",
        toZoneId: "zone-far",
        width: 12,
      },
    ],
  };
}

describe("FP-1A spatial design is read from generated output", () => {
  it("accepts a complete design and preserves every stated coordinate", () => {
    const result = buildSpatialDesign(validBody());

    expect(result.outcome).toBe("designed");
    if (result.outcome !== "designed") return;
    const design = result.design;

    expect(design.schemaVersion).toBe(SPATIAL_DESIGN_SCHEMA_VERSION);
    // The literal, not the constant: a version bump has to be a visible change.
    expect(design.schemaVersion).toBe(1);
    expect(design.map.size).toEqual({ x: 512, y: 128, z: 512 });
    expect(design.zones).toHaveLength(2);
    expect(design.zones[0].groundHeight).toBe(8);
    // Absent optional stays absent rather than becoming a default.
    expect(design.zones[1].groundHeight).toBeUndefined();
    expect(design.spawns[0].position).toEqual({ x: 0, y: 10, z: 0 });
    expect(design.objects[0].orientation).toEqual({ x: 0, y: 45, z: 0 });
    expect(design.objects[0].material).toBe("Wood");
    expect(design.terrain[0]).toEqual({
      id: "terrain-1",
      shape: "block",
      material: "Grass",
      position: { x: 0, y: 0, z: 0 },
      size: { x: 256, y: 16, z: 256 },
    });
    expect(design.paths[0].width).toBe(12);
  });

  it("accepts the design inside a spatialDesign envelope", () => {
    const result = buildSpatialDesign({ spatialDesign: validBody() });
    expect(result.outcome).toBe("designed");
  });

  it("reports absence separately from invalidity", () => {
    expect(buildSpatialDesign(undefined).outcome).toBe("absent");
    expect(buildSpatialDesign(null).outcome).toBe("absent");
    expect(buildSpatialDesign("not an object").outcome).toBe("absent");
    // An agent that answered with no map at all stated no design, which is a
    // different fact from stating a broken one.
    expect(buildSpatialDesign({ zones: [] }).outcome).toBe("absent");
  });
});

describe("FP-1A structurally invalid spatial output is rejected", () => {
  it("rejects a design with no spawn point", () => {
    const body = validBody();
    body.spawns = [];
    const result = buildSpatialDesign(body);

    expect(result.outcome).toBe("invalid");
    if (result.outcome !== "invalid") return;
    expect(result.issues.join(" ")).toContain("at least one spawn point");
  });

  it("rejects an unknown terrain material rather than passing it to Lua", () => {
    const body = validBody();
    body.terrain[0].material = "Unobtainium";
    const result = buildSpatialDesign(body);

    expect(result.outcome).toBe("invalid");
    if (result.outcome !== "invalid") return;
    expect(result.issues.join(" ")).toContain("terrain[0].material");
  });

  it("rejects an unknown object kind", () => {
    const body = validBody();
    body.objects[0].objectType = "spaceship";
    const result = buildSpatialDesign(body);
    expect(result.outcome).toBe("invalid");
  });

  it("rejects a non-finite or out-of-range coordinate", () => {
    const nan = validBody();
    nan.spawns[0].position.y = Number.NaN;
    expect(buildSpatialDesign(nan).outcome).toBe("invalid");

    const huge = validBody();
    huge.spawns[0].position.x = MAX_SPATIAL_COORDINATE + 1;
    expect(buildSpatialDesign(huge).outcome).toBe("invalid");
  });

  it("rejects a zone whose bounds enclose no area", () => {
    const body = validBody();
    body.zones[0].bounds = { minX: 10, minZ: 10, maxX: 10, maxZ: 40 };
    const result = buildSpatialDesign(body);

    expect(result.outcome).toBe("invalid");
    if (result.outcome !== "invalid") return;
    expect(result.issues.join(" ")).toContain("positive area");
  });

  it("rejects a terrain region with a non-positive extent", () => {
    const body = validBody();
    body.terrain[0].size = { x: 100, y: 0, z: 100 };
    const result = buildSpatialDesign(body);
    expect(result.outcome).toBe("invalid");
  });

  it("rejects a path that names a zone the design never defined", () => {
    const body = validBody();
    body.paths[0].toZoneId = "zone-that-does-not-exist";
    const result = buildSpatialDesign(body);

    expect(result.outcome).toBe("invalid");
    if (result.outcome !== "invalid") return;
    expect(result.issues.join(" ")).toContain("not in the design");
  });
});

describe("FP-1A the design is described for the Lua generator", () => {
  it("states terrain, objects, spawns and paths with their coordinates", () => {
    const result = buildSpatialDesign(validBody());
    if (result.outcome !== "designed") throw new Error("expected a design");

    const text = describeSpatialDesign(result.design);

    expect(text).toContain("Terrain terrain-1 block Grass");
    expect(text).toContain("Spawn spawn-1");
    expect(text).toContain("(0, 10, 0)");
    expect(text).toContain("Object obj-1");
    expect(text).toContain("material Wood");
    expect(text).toContain("Path path-1 connects zone-start to zone-far");
    // Rendered as instructions, not as an echo of the wire format.
    expect(text).not.toContain("schemaVersion");
    expect(text.trimEnd()).not.toMatch(/[{}]/);
  });

  it("omits optional fields it was not given", () => {
    const body = validBody();
    delete (body.objects[0] as Record<string, unknown>).material;
    delete (body.objects[0] as Record<string, unknown>).orientation;
    const result = buildSpatialDesign(body);
    if (result.outcome !== "designed") throw new Error("expected a design");

    const text = describeSpatialDesign(result.design);
    expect(text).not.toContain("material");
    expect(text).not.toContain("rotation");
  });

  it("describes an empty design without inventing content", () => {
    const design: SpatialDesign = {
      schemaVersion: SPATIAL_DESIGN_SCHEMA_VERSION,
      map: {
        id: "m",
        name: "M",
        type: "main",
        size: { x: 1, y: 1, z: 1 },
        theme: "t",
      },
      zones: [],
      spawns: [],
      objects: [],
      terrain: [],
      paths: [],
    };
    expect(describeSpatialDesign(design).split("\n")).toHaveLength(1);
  });
});
