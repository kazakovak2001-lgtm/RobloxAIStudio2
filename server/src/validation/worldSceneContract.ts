/**
 * worldSceneContract.ts
 *
 * WORLD-1B. The wire contract for materializing the world model as real Studio
 * instances, at design time only.
 *
 * Two constraints shape every decision here.
 *
 * The first is ownership. `playableLua.ts` requires the generated server
 * `Script` to build the world into `workspace` at run time, so anything this
 * contract placed there would stand beside a second world on Play. The scene
 * is therefore delivered into `ReplicatedStorage.AIStudioArtifacts`, the
 * design-time hierarchy STUDIO-2F-A already established, which nothing in
 * generated Lua reads. The two definitions never contend because they are
 * never in the same container.
 *
 * The second is that this must not encode one game. Entities carry a semantic
 * role taken from the world model rather than a gameplay noun, zones group by
 * role rather than by purpose, and transforms are derived rather than
 * authored. A racing grid and a tycoon plot differ only in which roles their
 * claims carry — there is no spawn, collectible or objective in this file.
 *
 * The class allowlist is a security control. No script class appears in it and
 * no allowlisted class accepts `Source`, so executable code cannot be
 * expressed through this contract at all.
 */

import { WORLD_ROLES, type WorldModel, type WorldRole } from "./worldModel";

/** Contract version of the scene body. Bump on any shape change. */
export const WORLD_SCENE_SCHEMA_VERSION = 1;

export const MAX_WORLD_SCENE_DEPTH = 6;
export const MAX_WORLD_SCENE_NODES = 400;
export const MAX_WORLD_INSTANCE_NAME_LENGTH = 50;

/** Largest integer a Roblox 32-bit integer property accepts. */
export const MAX_WORLD_SAFE_INT = 2_147_483_647;

/**
 * Closed class allowlist. Containers and one inert solid — enough to express
 * containment and a transform, and nothing that can carry behaviour.
 */
export const ALLOWED_WORLD_CLASSES = ["Folder", "Model", "Part"] as const;
export type AllowedWorldClass = (typeof ALLOWED_WORLD_CLASSES)[number];

export type WorldPropertyValue =
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: number }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "vector3"; x: number; y: number; z: number }
  | { kind: "color3"; r: number; g: number; b: number }
  | { kind: "enum"; enumName: string; item: string };

export type WorldPropertyKind = WorldPropertyValue["kind"];

/** Attribute values carrying semantic identity. Deliberately scalar only. */
export type WorldAttributeValue =
  | { kind: "string"; value: string }
  | { kind: "int"; value: number }
  | { kind: "bool"; value: boolean };

export interface WorldSceneNode {
  readonly className: AllowedWorldClass;
  readonly name: string;
  readonly properties?: Readonly<Record<string, WorldPropertyValue>>;
  readonly attributes?: Readonly<Record<string, WorldAttributeValue>>;
  readonly children?: readonly WorldSceneNode[];
}

/** One claimed entity, and the instance subtree that represents it. */
export interface WorldSceneEntity {
  /** The world model's own identifier. Never a random id. */
  readonly entityId: string;
  readonly role: WorldRole;
  readonly node: WorldSceneNode;
}

/** Entities grouped by role. Containment without prescribing purpose. */
export interface WorldSceneZone {
  readonly zoneName: string;
  readonly role: WorldRole;
  readonly entities: readonly WorldSceneEntity[];
}

export interface MaterializableWorldScene {
  readonly sceneVersion: number;
  /** The model version these claims came from, so drift is visible. */
  readonly modelSchemaVersion: number;
  readonly zones: readonly WorldSceneZone[];
}

/** A world model artifact that also carries a materializable scene. */
export interface WorldArtifactContent extends WorldModel {
  readonly scene: MaterializableWorldScene;
}

export const ALLOWED_WORLD_PROPERTIES: Readonly<
  Record<AllowedWorldClass, Readonly<Record<string, WorldPropertyKind>>>
> = {
  Folder: {},
  Model: {},
  Part: {
    Size: "vector3",
    Position: "vector3",
    Anchored: "bool",
    CanCollide: "bool",
    CanTouch: "bool",
    Color: "color3",
    Transparency: "number",
    Material: "enum",
  },
};

export const ALLOWED_WORLD_ENUM_ITEMS: Readonly<
  Record<string, readonly string[]>
> = {
  Material: ["Plastic", "SmoothPlastic", "Neon", "Wood", "Metal", "Glass"],
};

/**
 * Attribute allowlist. Every name is namespaced, so a delivered attribute can
 * never shadow one a creator set for their own purposes.
 */
export const ALLOWED_WORLD_ATTRIBUTES: Readonly<
  Record<string, WorldAttributeValue["kind"]>
> = {
  AIStudioWorldEntityId: "string",
  AIStudioWorldRole: "string",
  AIStudioWorldSource: "string",
  AIStudioWorldQuantity: "int",
  AIStudioWorldRelations: "string",
  AIStudioWorldRequires: "string",
  AIStudioWorldZone: "string",
  AIStudioWorldModelVersion: "int",
};

/** Marks an instance as owned by this system and safe to replace. */
export const WORLD_MANAGED_ATTRIBUTE = "AIStudioManaged";

/** States that the delivery is design-time, not a runtime world. */
export const WORLD_DELIVERY_MODE_ATTRIBUTE = "AIStudioDeliveryMode";
export const WORLD_DELIVERY_MODE = "design-time";

/** Reserved container for creator-authored instances found in a managed tree. */
export const WORLD_PRESERVED_FOLDER = "AIStudioPreserved";

/** The stage whose folder the scene is delivered into. */
export const WORLD_SCENE_STAGE = "WORLD_MODEL";

/**
 * Where a materialized entity must appear.
 *
 * The backend derives the expected path from the stored artifact, so a plugin
 * cannot define its own success criteria by reporting whatever it built.
 */
export function expectedWorldInstancePath(
  stage: string,
  zoneName: string,
  entityNodeName: string,
): string {
  return `ReplicatedStorage.AIStudioArtifacts.${stage}.${zoneName}.${entityNodeName}`;
}

/**
 * The instance name for an entity, derived from its semantic identifier.
 *
 * Stable across regenerations because the identifier is: the model derives
 * `service-spawnservice` from the claim, not from a counter or a random id.
 */
export function worldEntityNodeName(entityId: string): string {
  const cleaned = entityId
    .replace(/[^A-Za-z0-9_ -]/g, "-")
    .slice(0, MAX_WORLD_INSTANCE_NAME_LENGTH);
  return /^[A-Za-z0-9_]/.test(cleaned) ? cleaned : `Entity-${cleaned}`;
}

/** The zone container name for a role. Deterministic and name-safe. */
export function worldZoneName(role: WorldRole): string {
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Every zone name this contract can produce, in role order. */
export const WORLD_ZONE_NAMES: readonly string[] =
  WORLD_ROLES.map(worldZoneName);

export function isValidWorldInstanceName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_WORLD_INSTANCE_NAME_LENGTH &&
    value !== WORLD_PRESERVED_FOLDER &&
    /^[A-Za-z0-9_]/.test(value) &&
    /^[A-Za-z0-9_ -]+$/.test(value)
  );
}

/**
 * Whether an artifact's content carries a scene this contract can materialize.
 *
 * Used on both sides of the boundary: the plugin routes on it, and the backend
 * decides from it whether entity receipts are required. Content without a
 * scene imposes no requirement, which is what lets an older plugin fall back
 * to recording the model as inert metadata without anyone claiming a world was
 * materialized.
 */
/**
 * Validate a scene against the same rules the plugin enforces.
 *
 * The plugin's copy remains the authority for what reaches `Instance.new` —
 * that is why it is an independent implementation rather than a mirror. This
 * one exists so the backend never *sends* a scene the plugin will refuse,
 * which turns a silent Studio-side rejection into a defect caught here.
 *
 * Returns an empty array when the scene is valid.
 */
export function validateWorldScene(scene: unknown): string[] {
  if (typeof scene !== "object" || scene === null) {
    return ["world scene must be an object"];
  }
  const candidate = scene as Partial<MaterializableWorldScene>;
  if (candidate.sceneVersion !== WORLD_SCENE_SCHEMA_VERSION) {
    return [
      `world scene sceneVersion must be ${WORLD_SCENE_SCHEMA_VERSION}, received ${String(candidate.sceneVersion)}`,
    ];
  }
  if (!Array.isArray(candidate.zones)) {
    return ["world scene must contain a zones array"];
  }

  const issues: string[] = [];
  const seenZones = new Set<string>();
  const seenEntities = new Set<string>();
  let budget = MAX_WORLD_SCENE_NODES;

  for (const zone of candidate.zones) {
    if (!isValidWorldInstanceName(zone?.zoneName)) {
      issues.push("a zone requires a valid zoneName");
      continue;
    }
    if (seenZones.has(zone.zoneName)) {
      issues.push(`duplicate zoneName ${zone.zoneName}`);
    }
    seenZones.add(zone.zoneName);
    budget -= 1;

    if (!Array.isArray(zone.entities)) {
      issues.push(`${zone.zoneName} requires an entities array`);
      continue;
    }

    const namesInZone = new Set<string>();
    for (const entity of zone.entities) {
      if (typeof entity?.entityId !== "string" || entity.entityId === "") {
        issues.push(`${zone.zoneName} has an entity without a semantic id`);
        continue;
      }
      // Semantic identity is global: the same claim in two zones would make a
      // receipt ambiguous about which one it means.
      if (seenEntities.has(entity.entityId)) {
        issues.push(`duplicate entityId ${entity.entityId}`);
      }
      seenEntities.add(entity.entityId);

      if (namesInZone.has(entity.node?.name)) {
        issues.push(
          `${zone.zoneName} has duplicate entity name ${entity.node?.name}`,
        );
      }
      namesInZone.add(entity.node?.name);

      const consumed = validateWorldNode(
        entity.node,
        zone.zoneName,
        2,
        budget,
        issues,
      );
      budget -= consumed;
    }
  }

  if (budget < 0) {
    issues.push(
      `world scene exceeds the ${MAX_WORLD_SCENE_NODES}-instance budget`,
    );
  }

  return issues;
}

function validateWorldNode(
  node: unknown,
  path: string,
  depth: number,
  budget: number,
  issues: string[],
): number {
  if (typeof node !== "object" || node === null) {
    issues.push(`${path} must be an object`);
    return 0;
  }
  if (depth > MAX_WORLD_SCENE_DEPTH) {
    issues.push(
      `${path} exceeds the maximum depth of ${MAX_WORLD_SCENE_DEPTH}`,
    );
    return 0;
  }

  const candidate = node as Partial<WorldSceneNode>;
  const className = candidate.className as string;
  if (!ALLOWED_WORLD_CLASSES.includes(className as AllowedWorldClass)) {
    issues.push(
      `${path} has a class outside the allowlist: ${String(className)}`,
    );
    return 0;
  }
  if (!isValidWorldInstanceName(candidate.name)) {
    issues.push(`${path} requires a valid instance name`);
    return 0;
  }

  const nodePath = `${path}.${candidate.name}`;
  let consumed = 1;
  if (consumed > budget) {
    issues.push(
      `world scene exceeds the ${MAX_WORLD_SCENE_NODES}-instance budget`,
    );
    return consumed;
  }

  const allowedProperties =
    ALLOWED_WORLD_PROPERTIES[className as AllowedWorldClass];
  for (const [property, value] of Object.entries(candidate.properties ?? {})) {
    const expectedKind = allowedProperties[property];
    if (!expectedKind) {
      issues.push(
        `${nodePath} has a property outside the allowlist: ${property}`,
      );
      continue;
    }
    const issue = validateWorldPropertyValue(value, expectedKind, property);
    if (issue) issues.push(`${nodePath}.${property} ${issue}`);
  }

  for (const [attribute, value] of Object.entries(candidate.attributes ?? {})) {
    const expectedKind = ALLOWED_WORLD_ATTRIBUTES[attribute];
    if (!expectedKind) {
      issues.push(
        `${nodePath} has an attribute outside the allowlist: ${attribute}`,
      );
      continue;
    }
    if ((value as { kind?: unknown })?.kind !== expectedKind) {
      issues.push(`${nodePath}@${attribute} must have kind ${expectedKind}`);
    }
  }

  const namesInNode = new Set<string>();
  for (const child of candidate.children ?? []) {
    const childName = (child as { name?: string })?.name;
    if (typeof childName === "string") {
      if (namesInNode.has(childName)) {
        issues.push(`${nodePath} has duplicate child name ${childName}`);
      }
      namesInNode.add(childName);
    }
    consumed += validateWorldNode(
      child,
      nodePath,
      depth + 1,
      budget - consumed,
      issues,
    );
  }

  return consumed;
}

function validateWorldPropertyValue(
  value: unknown,
  expectedKind: WorldPropertyKind,
  property: string,
): string | null {
  if (typeof value !== "object" || value === null) {
    return "must be a typed property value";
  }
  const typed = value as Record<string, unknown>;
  if (typed.kind !== expectedKind) {
    return `must have kind ${expectedKind}, received ${String(typed.kind)}`;
  }

  const finite = (candidate: unknown): boolean =>
    typeof candidate === "number" && Number.isFinite(candidate);
  const channel = (candidate: unknown): boolean =>
    typeof candidate === "number" &&
    Number.isInteger(candidate) &&
    candidate >= 0 &&
    candidate <= 255;

  switch (expectedKind) {
    case "bool":
      return typeof typed.value === "boolean" ? null : "must carry a boolean";
    case "int":
      return typeof typed.value === "number" &&
        Number.isInteger(typed.value) &&
        Math.abs(typed.value) <= MAX_WORLD_SAFE_INT
        ? null
        : "must carry a 32-bit integer";
    case "number":
      return finite(typed.value) ? null : "must carry a finite number";
    case "string":
      return typeof typed.value === "string" ? null : "must carry a string";
    case "vector3":
      return finite(typed.x) && finite(typed.y) && finite(typed.z)
        ? null
        : "must carry finite x/y/z";
    case "color3":
      return channel(typed.r) && channel(typed.g) && channel(typed.b)
        ? null
        : "must carry integer r/g/b in 0-255";
    case "enum": {
      if (typed.enumName !== property) {
        return `must use enum ${property}, received ${String(typed.enumName)}`;
      }
      const items = ALLOWED_WORLD_ENUM_ITEMS[property];
      if (!items) return `references an unknown enum ${property}`;
      return typeof typed.item === "string" && items.includes(typed.item)
        ? null
        : `references an unknown ${property} item ${String(typed.item)}`;
    }
    default:
      return `has an unsupported value kind ${String(expectedKind)}`;
  }
}

export function carriesMaterializableWorldScene(
  content: unknown,
): content is WorldArtifactContent {
  if (typeof content !== "object" || content === null) return false;
  const scene = (content as { scene?: unknown }).scene;
  if (typeof scene !== "object" || scene === null) return false;
  return (
    (scene as { sceneVersion?: unknown }).sceneVersion ===
    WORLD_SCENE_SCHEMA_VERSION
  );
}
