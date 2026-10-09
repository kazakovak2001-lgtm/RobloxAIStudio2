/**
 * WorldScenePlanner.ts
 *
 * GEN-FIDELITY-3. Between the blueprint and the Lua materializer, this module
 * plans *what the world is actually shaped like* — the semantic world/scene
 * specification LuaGenerator now consumes instead of reducing every
 * mechanic/landmark/biome to an identical primitive.
 *
 * Deterministic and pure: the same blueprint always plans the same
 * `WorldSceneSpec`. No I/O, no clock, no randomness — concept detection reads
 * only blueprint text (title/description/genre/mechanics/landmarks/coreLoop),
 * and every position is computed from blueprint ordinals, never guessed.
 *
 * Scoped to the blueprint -> Lua pipeline only. This is a different, older,
 * deterministic pipeline from the agent-authored `SpatialDesign` /
 * `WorldModel` -> scene-graph pipeline (see `validation/spatialDesign.ts`,
 * `validation/worldSceneBuilder.ts`) that backs WORLD-1B/1C materialized-world
 * delivery — that pipeline consumes an AI-authored design and refuses on
 * anything it cannot parse; this one has no such design to consume and must
 * still produce a coherent world from the blueprint alone.
 */

import type { RobloxGameBlueprint } from "../blueprint/GameBlueprintEngine";

/** Gap between a tower's base and the objective placed beside it, in studs. */
const TOWER_INTERACTABLE_CLEARANCE = 4;
/** Obby rise per platform: within reach of the default 7.2-stud jump. */
const OBBY_STEP_UP = 3;
/** Obby platform spacing: 10-stud platforms leave a 4-stud gap. */
const OBBY_STEP_FORWARD = 14;
/** Island camps stay within ±80 studs of the 200-stud baseplate's centre. */
const ISLAND_CAMP_HALF_SPAN = 80;

export type SceneConceptCategory = "fortress" | "obby" | "island" | "generic";

export interface ScenePosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SceneSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One zone per blueprint biome — carried over from the original generic layout. */
export interface SceneZone {
  readonly id: string;
  readonly name: string;
  readonly role: "biome";
  readonly position: ScenePosition;
  readonly size: SceneSize;
  readonly colorIndex: number;
}

/** One marker per blueprint landmark — carried over from the original generic layout. */
export interface SceneLandmark {
  readonly id: string;
  readonly name: string;
  readonly position: ScenePosition;
  readonly size: SceneSize;
}

export type SceneStructureType =
  | "wall"
  | "tower"
  | "gate"
  | "courtyard"
  | "platform"
  | "camp"
  | "building"
  | "generic";

/** One construction primitive inside a structure — a building block, not a placeholder. */
export interface SceneStructurePart {
  readonly name: string;
  readonly position: ScenePosition;
  readonly size: SceneSize;
  readonly colorRgb: readonly [number, number, number];
}

/** A grouped, recognizable structure — built from >=1 primitive parts. */
export interface SceneStructure {
  readonly id: string;
  readonly type: SceneStructureType;
  readonly name: string;
  readonly semanticRole: string;
  readonly parts: readonly SceneStructurePart[];
}

/** A route/connectivity claim — e.g. the enemy approach toward the gate. */
export interface ScenePath {
  readonly id: string;
  readonly role: string;
  readonly points: readonly ScenePosition[];
}

export type SceneSpawnType = "player" | "enemy" | "npc";

export interface SceneSpawn {
  readonly id: string;
  readonly type: SceneSpawnType;
  readonly name: string;
  readonly position: ScenePosition;
  readonly linkedZoneId?: string;
}

/** One gameplay-linked interactable per blueprint mechanic, semantically positioned. */
export interface SceneInteractable {
  readonly id: string;
  readonly linkedMechanic: string;
  readonly name: string;
  readonly position: ScenePosition;
  readonly linkedStructureId?: string;
}

export interface WorldSceneSpec {
  readonly category: SceneConceptCategory;
  readonly zones: readonly SceneZone[];
  readonly landmarks: readonly SceneLandmark[];
  readonly structures: readonly SceneStructure[];
  readonly paths: readonly ScenePath[];
  readonly spawns: readonly SceneSpawn[];
  readonly interactables: readonly SceneInteractable[];
}

const FORTRESS_KEYWORDS = [
  "fortress",
  "castle",
  "medieval",
  "stronghold",
  "keep",
  "siege",
  "rampart",
  "citadel",
];

const OBBY_KEYWORDS = ["obby", "parkour", "platformer"];

const ISLAND_KEYWORDS = [
  "island",
  "archipelago",
  "trial grounds",
  "adventure trial",
];

function blueprintConceptText(bp: RobloxGameBlueprint): string {
  return [
    bp.title,
    bp.description,
    bp.genre,
    ...bp.mechanics,
    ...bp.world.landmarks,
    ...bp.coreLoop,
    bp.progression.type,
  ]
    .join(" ")
    .toLowerCase();
}

function matchesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/**
 * Detect the concept category from blueprint text alone. Order matters: a
 * blueprint could plausibly mention "trial" and "obby" together, but a
 * fortress/medieval-defense signal is the most structurally specific and
 * takes priority when present.
 */
export function detectConceptCategory(
  bp: RobloxGameBlueprint,
): SceneConceptCategory {
  const text = blueprintConceptText(bp);
  if (matchesAny(text, FORTRESS_KEYWORDS)) return "fortress";
  if (matchesAny(text, OBBY_KEYWORDS)) return "obby";
  if (matchesAny(text, ISLAND_KEYWORDS)) return "island";
  return "generic";
}

function biomeZones(bp: RobloxGameBlueprint): SceneZone[] {
  return bp.world.biomes.map((biome, index) => ({
    id: `zone-${index + 1}`,
    name: `${biome}_Zone`,
    role: "biome",
    position: { x: index * 100, y: 0, z: -60 },
    size: { x: 80, y: 1, z: 80 },
    colorIndex: index,
  }));
}

function landmarkMarkers(bp: RobloxGameBlueprint): SceneLandmark[] {
  return bp.world.landmarks.map((landmark, index) => ({
    id: `landmark-${index + 1}`,
    name: `${landmark}_Landmark`,
    position: { x: 250 + index * 50, y: 10, z: -50 },
    size: { x: 6, y: 20, z: 6 },
  }));
}

/**
 * The original, unstructured world: one interactable per mechanic in a
 * straight row. Kept as the explicit fallback for concepts that name no
 * recognizable structural intent, rather than deleted — GEN-FIDELITY-1/2's
 * acceptance fixtures plan into this category and must keep planning into it
 * byte-for-byte.
 */
function buildGenericScene(bp: RobloxGameBlueprint): WorldSceneSpec {
  const mechanics = bp.mechanics.length > 0 ? bp.mechanics : ["objective"];
  return {
    category: "generic",
    zones: biomeZones(bp),
    landmarks: landmarkMarkers(bp),
    structures: [],
    paths: [],
    spawns: [
      {
        id: "spawn-player",
        type: "player",
        name: "MainSpawn",
        position: { x: 0, y: 1, z: 0 },
      },
    ],
    interactables: mechanics.map((mechanic, index) => ({
      id: `interactable-${index + 1}`,
      linkedMechanic: mechanic,
      name: `${mechanic}_Interactable`,
      position: { x: index * 15, y: 2, z: 30 },
    })),
  };
}

const WALL_COLOR: readonly [number, number, number] = [120, 110, 96];
const TOWER_COLOR: readonly [number, number, number] = [104, 96, 84];
const GATE_COLOR: readonly [number, number, number] = [90, 60, 36];
const COURTYARD_COLOR: readonly [number, number, number] = [156, 148, 120];
const ROUTE_COLOR: readonly [number, number, number] = [178, 34, 34];

/**
 * A perimeter with a gate opening, 4 corner towers and an interior courtyard —
 * the minimum a "fortress" reads as, not a cube renamed "fortress".
 *
 * Footprint is a fixed square (deterministic; nothing about a fortress's size
 * is stated by the blueprint, so this is the generator's own structural
 * default, same as the original generic row's fixed spacing was). The gate
 * sits centered in the south wall (the wall nearest negative Z, which is also
 * where the enemy approach route arrives from).
 */
function buildFortressScene(bp: RobloxGameBlueprint): WorldSceneSpec {
  const half = 60; // courtyard half-extent, studs
  const wallHeight = 24;
  const wallThickness = 6;
  const gateWidth = 20;

  const corners = {
    nw: { x: -half, z: -half },
    ne: { x: half, z: -half },
    se: { x: half, z: half },
    sw: { x: -half, z: half },
  };

  const structures: SceneStructure[] = [];

  // North, east and west walls: unbroken.
  structures.push(
    wallStructure(
      "NorthWall",
      { x: 0, y: wallHeight / 2, z: half },
      { x: half * 2 + wallThickness, y: wallHeight, z: wallThickness },
    ),
  );
  structures.push(
    wallStructure(
      "EastWall",
      { x: half, y: wallHeight / 2, z: 0 },
      { x: wallThickness, y: wallHeight, z: half * 2 + wallThickness },
    ),
  );
  structures.push(
    wallStructure(
      "WestWall",
      { x: -half, y: wallHeight / 2, z: 0 },
      { x: wallThickness, y: wallHeight, z: half * 2 + wallThickness },
    ),
  );

  // South wall: split either side of the gate opening.
  const southSegmentLength = half - gateWidth / 2;
  structures.push(
    wallStructure(
      "SouthWallEast",
      { x: (gateWidth / 2 + half) / 2, y: wallHeight / 2, z: -half },
      { x: southSegmentLength, y: wallHeight, z: wallThickness },
    ),
  );
  structures.push(
    wallStructure(
      "SouthWallWest",
      { x: -(gateWidth / 2 + half) / 2, y: wallHeight / 2, z: -half },
      { x: southSegmentLength, y: wallHeight, z: wallThickness },
    ),
  );

  // Gate: a distinct door part filling the opening, shorter than the walls
  // so its top is visibly an opening, plus a raised lintel/arch part above it.
  const gateStructure: SceneStructure = {
    id: "structure-gate",
    type: "gate",
    name: "MainGate",
    semanticRole: "fortress-entrance",
    parts: [
      {
        name: "MainGate_Door",
        position: { x: 0, y: wallHeight / 3, z: -half },
        size: { x: gateWidth, y: (wallHeight * 2) / 3, z: wallThickness },
        colorRgb: GATE_COLOR,
      },
      {
        name: "MainGate_Arch",
        position: { x: 0, y: wallHeight - 2, z: -half },
        size: { x: gateWidth + wallThickness, y: 4, z: wallThickness },
        colorRgb: WALL_COLOR,
      },
    ],
  };
  structures.push(gateStructure);

  // Four corner towers, each multi-part: a tall base and a distinct roof.
  const towerStructures: SceneStructure[] = Object.entries(corners).map(
    ([key, corner], index) => {
      const towerHeight = wallHeight * 1.6;
      return {
        id: `structure-tower-${index + 1}`,
        type: "tower",
        name: `${towerCornerName(key)}Tower`,
        semanticRole: "fortress-defense-point",
        parts: [
          {
            name: `${towerCornerName(key)}Tower_Base`,
            position: { x: corner.x, y: towerHeight / 2, z: corner.z },
            size: { x: 14, y: towerHeight, z: 14 },
            colorRgb: TOWER_COLOR,
          },
          {
            name: `${towerCornerName(key)}Tower_Roof`,
            position: { x: corner.x, y: towerHeight + 3, z: corner.z },
            size: { x: 18, y: 6, z: 18 },
            colorRgb: GATE_COLOR,
          },
        ],
      };
    },
  );
  structures.push(...towerStructures);

  // Courtyard: the interior floor, distinct in size/color from a biome zone.
  const courtyardStructure: SceneStructure = {
    id: "structure-courtyard",
    type: "courtyard",
    name: "Courtyard",
    semanticRole: "fortress-interior",
    parts: [
      {
        name: "Courtyard_Floor",
        position: { x: 0, y: 0, z: 0 },
        size: {
          x: half * 2 - wallThickness,
          y: 1,
          z: half * 2 - wallThickness,
        },
        colorRgb: COURTYARD_COLOR,
      },
    ],
  };
  structures.push(courtyardStructure);

  // Enemy approach route: waypoints from the enemy spawn straight to the gate.
  const enemySpawnZ = -(half + 100);
  const routePoints: ScenePosition[] = [
    { x: 0, y: 2, z: enemySpawnZ },
    { x: 0, y: 2, z: enemySpawnZ + 40 },
    { x: 0, y: 2, z: enemySpawnZ + 80 },
    { x: 0, y: 2, z: -half - 5 },
  ];

  const spawns: SceneSpawn[] = [
    {
      id: "spawn-player",
      type: "player",
      name: "MainSpawn",
      position: { x: 0, y: 1, z: 0 },
      linkedZoneId: courtyardStructure.id,
    },
    {
      id: "spawn-enemy",
      type: "enemy",
      name: "EnemySpawn",
      position: { x: 0, y: 2, z: enemySpawnZ },
    },
  ];

  const mechanics = bp.mechanics.length > 0 ? bp.mechanics : ["objective"];
  const interactables = fortressInteractables(
    mechanics,
    towerStructures,
    gateStructure,
    half,
  );

  return {
    category: "fortress",
    zones: biomeZones(bp),
    landmarks: landmarkMarkers(bp),
    structures,
    paths: [
      {
        id: "path-enemy-approach",
        role: "enemy-approach-route",
        points: routePoints,
      },
    ],
    spawns,
    interactables,
  };
}

function towerCornerName(key: string): string {
  const names: Record<string, string> = {
    nw: "NorthWest",
    ne: "NorthEast",
    se: "SouthEast",
    sw: "SouthWest",
  };
  return names[key] ?? key;
}

function wallStructure(
  name: string,
  position: ScenePosition,
  size: SceneSize,
): SceneStructure {
  return {
    id: `structure-${name}`,
    type: "wall",
    name,
    semanticRole: "fortress-perimeter",
    parts: [{ name: `${name}_Wall`, position, size, colorRgb: WALL_COLOR }],
  };
}

/**
 * Mechanics that name a defensive system get placed at the structure they
 * describe (an "archer tower" mechanic sits at a tower, a "gate repair"
 * mechanic sits at the gate); everything else is spread around the courtyard
 * perimeter by angle, not stacked in an arbitrary straight line.
 */
function fortressInteractables(
  mechanics: readonly string[],
  towers: readonly SceneStructure[],
  gate: SceneStructure,
  courtyardHalf: number,
): SceneInteractable[] {
  const perimeterRadius = courtyardHalf * 0.7;
  let perimeterIndex = 0;
  const perimeterCount = mechanics.filter(
    (m) => !mechanicMatchesTower(m) && !mechanicMatchesGate(m),
  ).length;

  return mechanics.map((mechanic, index) => {
    if (mechanicMatchesTower(mechanic)) {
      const tower = towers[index % towers.length];
      const base = tower.parts[0];
      // Beside the tower on the courtyard side, not inside its solid base: a
      // point within the base's footprint could never be reached or touched.
      const clearance = base.size.x / 2 + TOWER_INTERACTABLE_CLEARANCE;
      return {
        id: `interactable-${index + 1}`,
        linkedMechanic: mechanic,
        name: `${mechanic}_Interactable`,
        position: {
          x: base.position.x - Math.sign(base.position.x) * clearance,
          y: 3,
          z: base.position.z - Math.sign(base.position.z) * clearance,
        },
        linkedStructureId: tower.id,
      };
    }
    if (mechanicMatchesGate(mechanic)) {
      const gateDoor = gate.parts[0];
      return {
        id: `interactable-${index + 1}`,
        linkedMechanic: mechanic,
        name: `${mechanic}_Interactable`,
        position: {
          x: gateDoor.position.x + 8,
          y: 3,
          z: gateDoor.position.z + 4,
        },
        linkedStructureId: gate.id,
      };
    }
    const angle =
      perimeterCount > 0 ? (2 * Math.PI * perimeterIndex) / perimeterCount : 0;
    perimeterIndex += 1;
    return {
      id: `interactable-${index + 1}`,
      linkedMechanic: mechanic,
      name: `${mechanic}_Interactable`,
      position: {
        x: Math.round(Math.cos(angle) * perimeterRadius),
        y: 2,
        z: Math.round(Math.sin(angle) * perimeterRadius),
      },
    };
  });
}

function mechanicMatchesTower(mechanic: string): boolean {
  const m = mechanic.toLowerCase();
  return m.includes("archer") || m.includes("tower") || m.includes("bow");
}

function mechanicMatchesGate(mechanic: string): boolean {
  const m = mechanic.toLowerCase();
  return m.includes("gate") || m.includes("repair");
}

/**
 * A sequence of ascending platforms rather than one cube per mechanic — the
 * minimum an "obby" reads as. Each platform steps up and forward from the
 * last, and the mechanic's interactable sits on top of its own platform.
 */
function buildObbyScene(bp: RobloxGameBlueprint): WorldSceneSpec {
  const mechanics = bp.mechanics.length > 0 ? bp.mechanics : ["objective"];
  // Each platform must be reachable with the default character: JumpHeight
  // 7.2 studs, gravity 196.2 and WalkSpeed 16 carry a jump about 7.6 studs
  // forward while rising 3. With 10-stud platforms 14 apart the gap is 4.
  const stepForward = OBBY_STEP_FORWARD;
  const stepUp = OBBY_STEP_UP;
  const platformSize: SceneSize = { x: 10, y: 1, z: 10 };

  const structures: SceneStructure[] = mechanics.map((mechanic, index) => {
    const position: ScenePosition = {
      x: 0,
      y: 2 + index * stepUp,
      z: index * stepForward,
    };
    return {
      id: `structure-platform-${index + 1}`,
      type: "platform",
      name: `${mechanic}_Platform`,
      semanticRole: "obby-checkpoint",
      parts: [
        {
          name: `${mechanic}_Platform_Part`,
          position,
          size: platformSize,
          colorRgb: [
            60 + ((index * 47) % 180),
            120,
            220 - ((index * 31) % 150),
          ],
        },
      ],
    };
  });

  const interactables: SceneInteractable[] = mechanics.map(
    (mechanic, index) => ({
      id: `interactable-${index + 1}`,
      linkedMechanic: mechanic,
      name: `${mechanic}_Interactable`,
      position: { x: 0, y: 3 + index * stepUp, z: index * stepForward },
      linkedStructureId: structures[index]?.id,
    }),
  );

  const pathPoints: ScenePosition[] = structures.map(
    (s) => s.parts[0].position,
  );

  return {
    category: "obby",
    zones: biomeZones(bp),
    landmarks: landmarkMarkers(bp),
    structures,
    paths: [{ id: "path-ascent", role: "platform-ascent", points: pathPoints }],
    spawns: [
      {
        id: "spawn-player",
        type: "player",
        name: "MainSpawn",
        position: { x: 0, y: 2, z: -10 },
      },
    ],
    interactables,
  };
}

/**
 * A camp/waypoint structure per landmark (or per mechanic when the blueprint
 * names no landmarks), connected by a path across the biome zones — the
 * minimum an "island/trial" adventure reads as, instead of an undifferentiated
 * open field with a row of cubes.
 */
function buildIslandScene(bp: RobloxGameBlueprint): WorldSceneSpec {
  const zones = biomeZones(bp);
  const mechanics = bp.mechanics.length > 0 ? bp.mechanics : ["objective"];
  // Camps stay on the 200-stud baseplate: spread across at most ±80 and never
  // farther apart than the original 90, so every camp is on walkable ground.
  const campSpacing =
    mechanics.length > 1
      ? Math.min(90, (2 * ISLAND_CAMP_HALF_SPAN) / (mechanics.length - 1))
      : 0;
  const campStart = -((mechanics.length - 1) * campSpacing) / 2;

  const structures: SceneStructure[] = mechanics.map((mechanic, index) => {
    const position: ScenePosition = {
      x: campStart + index * campSpacing,
      y: 1,
      z: 60,
    };
    return {
      id: `structure-camp-${index + 1}`,
      type: "camp",
      name: `${mechanic}_Camp`,
      semanticRole: "trial-waypoint",
      parts: [
        {
          name: `${mechanic}_Camp_Platform`,
          position,
          size: { x: 16, y: 1, z: 16 },
          colorRgb: [200, 170, 110],
        },
        {
          name: `${mechanic}_Camp_Marker`,
          position: { x: position.x, y: 6, z: position.z },
          size: { x: 2, y: 10, z: 2 },
          colorRgb: [140, 90, 40],
        },
      ],
    };
  });

  const interactables: SceneInteractable[] = mechanics.map(
    (mechanic, index) => ({
      id: `interactable-${index + 1}`,
      linkedMechanic: mechanic,
      name: `${mechanic}_Interactable`,
      position: { x: campStart + index * campSpacing, y: 3, z: 60 },
      linkedStructureId: structures[index]?.id,
    }),
  );

  const pathPoints: ScenePosition[] = structures.map(
    (s) => s.parts[0].position,
  );

  return {
    category: "island",
    zones,
    landmarks: landmarkMarkers(bp),
    structures,
    paths: [
      { id: "path-trial-route", role: "trial-route", points: pathPoints },
    ],
    spawns: [
      {
        id: "spawn-player",
        type: "player",
        name: "MainSpawn",
        position: { x: 0, y: 1, z: 0 },
      },
    ],
    interactables,
  };
}

/**
 * Plan the deterministic semantic scene for a blueprint. Same blueprint,
 * same category, same coordinates — always.
 */
export function planWorldScene(bp: RobloxGameBlueprint): WorldSceneSpec {
  const category = detectConceptCategory(bp);
  switch (category) {
    case "fortress":
      return buildFortressScene(bp);
    case "obby":
      return buildObbyScene(bp);
    case "island":
      return buildIslandScene(bp);
    default:
      return buildGenericScene(bp);
  }
}

export { ROUTE_COLOR };
