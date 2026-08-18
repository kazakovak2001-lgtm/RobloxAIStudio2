/**
 * spatialDesign.ts
 *
 * FIRST-PLAYABLE-1 (FP-1A). The generated level: where things are, how big
 * they are, and what they are made of.
 *
 * This is deliberately *not* part of `WorldModel`. That model states what the
 * world is for and says so explicitly in its own limits — "this model is not
 * geometry". Runtime world ownership is Lua's under the current contract, so
 * the spatial design is a *design input carried to the Lua generator*, not a
 * second world that something else materializes. Nothing here creates
 * instances, and nothing here competes with `buildWorldScene`, which stays in
 * its design-time inspection role.
 *
 * The vocabulary is the one the repository already had. `EnvironmentGenerator`
 * defined these object/zone/spawn/map kinds before this slice existed; they are
 * lifted here so there is one definition rather than two, and that generator
 * imports them back. What this module adds is only what a first real level
 * needs and the older types lacked: per-object extent, orientation, material,
 * terrain regions, and connectivity.
 *
 * Everything is agent-produced. This module parses and rejects; it never
 * invents a coordinate. A design that cannot be read is reported as invalid
 * rather than silently replaced by a default level, because a default level is
 * a template and the platform exists to avoid templates.
 *
 * Pure module: no I/O, no clock, no model calls.
 */

/** Contract version of the design body. Bump on any shape change. */
export const SPATIAL_DESIGN_SCHEMA_VERSION = 1;

/** Bound on any single coordinate or extent, in studs. */
export const MAX_SPATIAL_COORDINATE = 20_000;
/** Bound on collection sizes, so one malformed response cannot flood a prompt. */
export const MAX_SPATIAL_ITEMS = 400;

/** Kinds carried over from `EnvironmentGenerator`, unchanged. */
export const SPATIAL_MAP_TYPES = [
  "main",
  "lobby",
  "arena",
  "dungeon",
  "stage",
] as const;
export type SpatialMapType = (typeof SPATIAL_MAP_TYPES)[number];

export const SPATIAL_ZONE_TYPES = [
  "safe",
  "combat",
  "puzzle",
  "exploration",
  "transition",
] as const;
export type SpatialZoneType = (typeof SPATIAL_ZONE_TYPES)[number];

export const SPATIAL_SPAWN_TYPES = [
  "initial",
  "checkpoint",
  "respawn",
  "team",
] as const;
export type SpatialSpawnType = (typeof SPATIAL_SPAWN_TYPES)[number];

export const SPATIAL_OBJECT_TYPES = [
  "terrain",
  "structure",
  "decoration",
  "interactive",
  "barrier",
] as const;
export type SpatialObjectType = (typeof SPATIAL_OBJECT_TYPES)[number];

/**
 * Terrain fill shapes the generated Lua can express with the voxel API.
 *
 * Kept to the three `Terrain:Fill*` forms that take a simple region, because
 * anything richer would be a shape language the generator has no way to check.
 */
export const SPATIAL_TERRAIN_SHAPES = ["block", "ball", "cylinder"] as const;
export type SpatialTerrainShape = (typeof SPATIAL_TERRAIN_SHAPES)[number];

/**
 * Materials a terrain region may claim.
 *
 * An allowlist rather than a free string: the value is handed to generated Lua
 * as an `Enum.Material` member, and an unrecognised name would be a runtime
 * error inside the generated game rather than a rejected design here. Names are
 * exactly the Roblox terrain material members.
 */
export const SPATIAL_TERRAIN_MATERIALS = [
  "Grass",
  "Sand",
  "Rock",
  "Slate",
  "Ground",
  "Mud",
  "Snow",
  "Ice",
  "Water",
  "Sandstone",
  "Basalt",
  "Limestone",
  "Asphalt",
  "LeafyGrass",
  "CrackedLava",
  "Salt",
  "Glacier",
] as const;
export type SpatialTerrainMaterial = (typeof SPATIAL_TERRAIN_MATERIALS)[number];

export interface SpatialVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SpatialBounds {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export interface SpatialMap {
  readonly id: string;
  readonly name: string;
  readonly type: SpatialMapType;
  /** Overall extent of the playable area, in studs. */
  readonly size: SpatialVector3;
  /** Free-text style intent, e.g. "tropical island". Never parsed for meaning. */
  readonly theme: string;
}

export interface SpatialZone {
  readonly id: string;
  readonly name: string;
  readonly type: SpatialZoneType;
  readonly bounds: SpatialBounds;
  /** Ground elevation across the zone, in studs. Absent means sea level. */
  readonly groundHeight?: number;
}

export interface SpatialSpawn {
  readonly id: string;
  readonly name: string;
  readonly type: SpatialSpawnType;
  readonly position: SpatialVector3;
}

export interface SpatialObject {
  readonly id: string;
  readonly name: string;
  readonly objectType: SpatialObjectType;
  readonly position: SpatialVector3;
  /** Extent in studs. Absent lets the generator choose a sensible default. */
  readonly size?: SpatialVector3;
  /** Euler rotation in degrees. Absent means unrotated. */
  readonly orientation?: SpatialVector3;
  /** Part material name, e.g. "Wood". Free-form: the generator validates it. */
  readonly material?: string;
  /** Zone this object belongs to, when the design states one. */
  readonly zoneId?: string;
}

export interface SpatialTerrainRegion {
  readonly id: string;
  readonly shape: SpatialTerrainShape;
  readonly material: SpatialTerrainMaterial;
  /** Centre of the region, in studs. */
  readonly position: SpatialVector3;
  /** Extent of the region, in studs. For `ball`, `x` is read as the radius. */
  readonly size: SpatialVector3;
}

/** Connectivity between two zones, so traversal is designed rather than assumed. */
export interface SpatialPath {
  readonly id: string;
  readonly fromZoneId: string;
  readonly toZoneId: string;
  /** Walkable width in studs. Absent lets the generator choose. */
  readonly width?: number;
}

export interface SpatialDesign {
  readonly schemaVersion: number;
  readonly map: SpatialMap;
  readonly zones: readonly SpatialZone[];
  readonly spawns: readonly SpatialSpawn[];
  readonly objects: readonly SpatialObject[];
  readonly terrain: readonly SpatialTerrainRegion[];
  readonly paths: readonly SpatialPath[];
}

/**
 * What the parser found.
 *
 * `absent` and `invalid` are kept apart on purpose: a stage that produced no
 * spatial design at all is a different fact from one that produced something
 * unreadable, and collapsing them would hide a model that is answering in the
 * wrong shape every time.
 */
export type SpatialDesignResult =
  | { readonly outcome: "designed"; readonly design: SpatialDesign }
  | { readonly outcome: "absent" }
  | { readonly outcome: "invalid"; readonly issues: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (Math.abs(value) > MAX_SPATIAL_COORDINATE) return null;
  return value;
}

function readVector3(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object with x, y and z`);
    return null;
  }
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const z = readFiniteNumber(value.z);
  if (x === null || y === null || z === null) {
    issues.push(
      `${path} must have finite x, y and z within ${MAX_SPATIAL_COORDINATE} studs`,
    );
    return null;
  }
  return { x, y, z };
}

function readNonEmptyString(
  value: unknown,
  path: string,
  issues: string[],
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`);
    return null;
  }
  return value.trim();
}

function readMember<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: string[],
): T | null {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issues.push(`${path} must be one of: ${allowed.join(", ")}`);
    return null;
  }
  return value as T;
}

function readArray(value: unknown, path: string, issues: string[]): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return [];
  }
  if (value.length > MAX_SPATIAL_ITEMS) {
    issues.push(`${path} exceeds ${MAX_SPATIAL_ITEMS} entries`);
    return value.slice(0, MAX_SPATIAL_ITEMS);
  }
  return value;
}

/**
 * Read a spatial design out of whatever an agent returned.
 *
 * Accepts either the design itself or a `{ spatialDesign: ... }` envelope, so
 * the caller does not have to know which shape the stage answered in.
 */
export function buildSpatialDesign(raw: unknown): SpatialDesignResult {
  if (raw === undefined || raw === null) return { outcome: "absent" };
  if (!isRecord(raw)) return { outcome: "absent" };

  const body = isRecord(raw.spatialDesign) ? raw.spatialDesign : raw;
  if (!isRecord(body.map)) return { outcome: "absent" };

  const issues: string[] = [];

  const mapId = readNonEmptyString(body.map.id, "map.id", issues);
  const mapName = readNonEmptyString(body.map.name, "map.name", issues);
  const mapType = readMember(
    body.map.type,
    SPATIAL_MAP_TYPES,
    "map.type",
    issues,
  );
  const mapSize = readVector3(body.map.size, "map.size", issues);
  const theme = readNonEmptyString(body.map.theme, "map.theme", issues);

  const zones: SpatialZone[] = [];
  readArray(body.zones, "zones", issues).forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`zones[${index}] must be an object`);
      return;
    }
    const id = readNonEmptyString(entry.id, `zones[${index}].id`, issues);
    const name = readNonEmptyString(entry.name, `zones[${index}].name`, issues);
    const type = readMember(
      entry.type,
      SPATIAL_ZONE_TYPES,
      `zones[${index}].type`,
      issues,
    );
    let bounds: SpatialBounds | null = null;
    if (isRecord(entry.bounds)) {
      const minX = readFiniteNumber(entry.bounds.minX);
      const minZ = readFiniteNumber(entry.bounds.minZ);
      const maxX = readFiniteNumber(entry.bounds.maxX);
      const maxZ = readFiniteNumber(entry.bounds.maxZ);
      if (minX === null || minZ === null || maxX === null || maxZ === null) {
        issues.push(
          `zones[${index}].bounds must have finite minX/minZ/maxX/maxZ`,
        );
      } else if (maxX <= minX || maxZ <= minZ) {
        issues.push(`zones[${index}].bounds must describe a positive area`);
      } else {
        bounds = { minX, minZ, maxX, maxZ };
      }
    } else {
      issues.push(`zones[${index}].bounds must be an object`);
    }
    const groundHeight =
      entry.groundHeight === undefined
        ? undefined
        : (readFiniteNumber(entry.groundHeight) ?? undefined);
    if (id && name && type && bounds) {
      zones.push({
        id,
        name,
        type,
        bounds,
        ...(groundHeight !== undefined ? { groundHeight } : {}),
      });
    }
  });

  const spawns: SpatialSpawn[] = [];
  readArray(body.spawns, "spawns", issues).forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`spawns[${index}] must be an object`);
      return;
    }
    const id = readNonEmptyString(entry.id, `spawns[${index}].id`, issues);
    const name = readNonEmptyString(
      entry.name,
      `spawns[${index}].name`,
      issues,
    );
    const type = readMember(
      entry.type,
      SPATIAL_SPAWN_TYPES,
      `spawns[${index}].type`,
      issues,
    );
    const position = readVector3(
      entry.position,
      `spawns[${index}].position`,
      issues,
    );
    if (id && name && type && position)
      spawns.push({ id, name, type, position });
  });

  const objects: SpatialObject[] = [];
  readArray(body.objects, "objects", issues).forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`objects[${index}] must be an object`);
      return;
    }
    const id = readNonEmptyString(entry.id, `objects[${index}].id`, issues);
    const name = readNonEmptyString(
      entry.name,
      `objects[${index}].name`,
      issues,
    );
    const objectType = readMember(
      entry.objectType,
      SPATIAL_OBJECT_TYPES,
      `objects[${index}].objectType`,
      issues,
    );
    const position = readVector3(
      entry.position,
      `objects[${index}].position`,
      issues,
    );
    const size =
      entry.size === undefined
        ? undefined
        : (readVector3(entry.size, `objects[${index}].size`, issues) ??
          undefined);
    const orientation =
      entry.orientation === undefined
        ? undefined
        : (readVector3(
            entry.orientation,
            `objects[${index}].orientation`,
            issues,
          ) ?? undefined);
    const material =
      typeof entry.material === "string" && entry.material.trim().length > 0
        ? entry.material.trim()
        : undefined;
    const zoneId =
      typeof entry.zoneId === "string" && entry.zoneId.trim().length > 0
        ? entry.zoneId.trim()
        : undefined;
    if (id && name && objectType && position) {
      objects.push({
        id,
        name,
        objectType,
        position,
        ...(size ? { size } : {}),
        ...(orientation ? { orientation } : {}),
        ...(material ? { material } : {}),
        ...(zoneId ? { zoneId } : {}),
      });
    }
  });

  const terrain: SpatialTerrainRegion[] = [];
  readArray(body.terrain, "terrain", issues).forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`terrain[${index}] must be an object`);
      return;
    }
    const id = readNonEmptyString(entry.id, `terrain[${index}].id`, issues);
    const shape = readMember(
      entry.shape,
      SPATIAL_TERRAIN_SHAPES,
      `terrain[${index}].shape`,
      issues,
    );
    const material = readMember(
      entry.material,
      SPATIAL_TERRAIN_MATERIALS,
      `terrain[${index}].material`,
      issues,
    );
    const position = readVector3(
      entry.position,
      `terrain[${index}].position`,
      issues,
    );
    const size = readVector3(entry.size, `terrain[${index}].size`, issues);
    if (size && (size.x <= 0 || size.y <= 0 || size.z <= 0)) {
      issues.push(`terrain[${index}].size must be positive in every axis`);
      return;
    }
    if (id && shape && material && position && size) {
      terrain.push({ id, shape, material, position, size });
    }
  });

  const paths: SpatialPath[] = [];
  readArray(body.paths, "paths", issues).forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`paths[${index}] must be an object`);
      return;
    }
    const id = readNonEmptyString(entry.id, `paths[${index}].id`, issues);
    const fromZoneId = readNonEmptyString(
      entry.fromZoneId,
      `paths[${index}].fromZoneId`,
      issues,
    );
    const toZoneId = readNonEmptyString(
      entry.toZoneId,
      `paths[${index}].toZoneId`,
      issues,
    );
    const width =
      entry.width === undefined
        ? undefined
        : (readFiniteNumber(entry.width) ?? undefined);
    if (id && fromZoneId && toZoneId) {
      paths.push({
        id,
        fromZoneId,
        toZoneId,
        ...(width !== undefined ? { width } : {}),
      });
    }
  });

  // A level with nowhere to stand is not a level. This is the one structural
  // rule that does not follow from a single field being malformed, so it is
  // stated rather than inferred from an empty array.
  if (spawns.length === 0) {
    issues.push("a spatial design must state at least one spawn point");
  }

  // Referential integrity, checked only against what actually parsed: a path
  // to a zone that does not exist would become generated Lua building a bridge
  // to nowhere.
  const zoneIds = new Set(zones.map((zone) => zone.id));
  for (const path of paths) {
    if (!zoneIds.has(path.fromZoneId) || !zoneIds.has(path.toZoneId)) {
      issues.push(`paths ${path.id} names a zone that is not in the design`);
    }
  }

  if (issues.length > 0) return { outcome: "invalid", issues };
  if (!mapId || !mapName || !mapType || !mapSize || !theme) {
    return { outcome: "invalid", issues: ["map is incomplete"] };
  }

  return {
    outcome: "designed",
    design: {
      schemaVersion: SPATIAL_DESIGN_SCHEMA_VERSION,
      map: { id: mapId, name: mapName, type: mapType, size: mapSize, theme },
      zones,
      spawns,
      objects,
      terrain,
      paths,
    },
  };
}

/**
 * Render a design as compact prompt context for the Lua generator.
 *
 * Deliberately a flat, terse listing rather than raw JSON: the generator reads
 * this as instructions about what to build, and a nested blob invites it to
 * echo the structure back instead of writing code against it.
 */
export function describeSpatialDesign(design: SpatialDesign): string {
  const lines: string[] = [];
  lines.push(
    `Map ${design.map.name} (${design.map.type}), theme "${design.map.theme}", extent ${design.map.size.x}x${design.map.size.y}x${design.map.size.z} studs.`,
  );
  for (const zone of design.zones) {
    const height =
      zone.groundHeight === undefined
        ? ""
        : ` groundHeight=${zone.groundHeight}`;
    lines.push(
      `Zone ${zone.id} "${zone.name}" (${zone.type}) x:${zone.bounds.minX}..${zone.bounds.maxX} z:${zone.bounds.minZ}..${zone.bounds.maxZ}${height}`,
    );
  }
  for (const spawn of design.spawns) {
    lines.push(
      `Spawn ${spawn.id} "${spawn.name}" (${spawn.type}) at (${spawn.position.x}, ${spawn.position.y}, ${spawn.position.z})`,
    );
  }
  for (const region of design.terrain) {
    lines.push(
      `Terrain ${region.id} ${region.shape} ${region.material} centre (${region.position.x}, ${region.position.y}, ${region.position.z}) size (${region.size.x}, ${region.size.y}, ${region.size.z})`,
    );
  }
  for (const object of design.objects) {
    const size = object.size
      ? ` size (${object.size.x}, ${object.size.y}, ${object.size.z})`
      : "";
    const orientation = object.orientation
      ? ` rotation (${object.orientation.x}, ${object.orientation.y}, ${object.orientation.z})`
      : "";
    const material = object.material ? ` material ${object.material}` : "";
    lines.push(
      `Object ${object.id} "${object.name}" (${object.objectType}) at (${object.position.x}, ${object.position.y}, ${object.position.z})${size}${orientation}${material}`,
    );
  }
  for (const path of design.paths) {
    const width = path.width === undefined ? "" : ` width ${path.width}`;
    lines.push(
      `Path ${path.id} connects ${path.fromZoneId} to ${path.toZoneId}${width}`,
    );
  }
  return lines.join("\n");
}
