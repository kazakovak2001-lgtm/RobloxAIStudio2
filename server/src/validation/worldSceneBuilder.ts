/**
 * worldSceneBuilder.ts
 *
 * WORLD-1B. Translate the semantic world model into a scene graph.
 *
 * Deterministic by construction: the same model always produces byte-identical
 * output. Nothing here reads a clock, a random source or the environment, and
 * ordering comes from the model's own order rather than from object-key
 * iteration. That is what lets re-export be a replacement rather than a
 * comparison — the plugin can replace a zone wholesale because the same claims
 * always land in the same place under the same name.
 *
 * The layout is derived, not designed. Position comes from the zone's ordinal
 * and the entity's ordinal within it, which gives a creator something legible
 * to look at without pretending the model contained geometry it never had.
 *
 * Pure module: no I/O, no clock, no model calls.
 */

import type { WorldModel, WorldRole } from "./worldModel";
import {
  ALLOWED_WORLD_ENUM_ITEMS,
  MAX_WORLD_SCENE_NODES,
  WORLD_SCENE_SCHEMA_VERSION,
  worldEntityNodeName,
  worldZoneName,
  type MaterializableWorldScene,
  type WorldAttributeValue,
  type WorldPropertyValue,
  type WorldSceneEntity,
  type WorldSceneNode,
  type WorldSceneZone,
} from "./worldSceneContract";

/** Spacing of the derived layout, in studs. */
const ENTITY_SPACING = 12;
const ZONE_SPACING = 24;
const MARKER_SIZE = 4;
const MARKER_HEIGHT = 2;

/**
 * Colour per role, so a creator can tell zones apart at a glance.
 *
 * Exhaustive over `WorldRole` on purpose: adding a role forces a decision here
 * rather than letting it fall back to an arbitrary default.
 */
const ROLE_COLOR: Readonly<Record<WorldRole, [number, number, number]>> = {
  "player-entry": [86, 180, 233],
  "interactive-entity": [230, 159, 0],
  "progress-signal": [0, 158, 115],
  presentation: [204, 121, 167],
  persistence: [120, 120, 120],
  "server-authority": [213, 94, 0],
  descriptive: [170, 170, 170],
};

function vector3(x: number, y: number, z: number): WorldPropertyValue {
  return { kind: "vector3", x, y, z };
}

function color3(rgb: readonly [number, number, number]): WorldPropertyValue {
  return { kind: "color3", r: rgb[0], g: rgb[1], b: rgb[2] };
}

function text(value: string): WorldAttributeValue {
  return { kind: "string", value };
}

/**
 * Build the scene from the model.
 *
 * Claims whose entity name cannot be derived are dropped rather than renamed
 * into something that would no longer match the model's own identifier: a
 * scene entity must be traceable to the claim it represents, or it should not
 * exist.
 */
export function buildWorldScene(model: WorldModel): MaterializableWorldScene {
  const claims = [
    ...model.systems.map((system) => ({ ...system, quantity: undefined })),
    ...model.entities,
  ];

  // Relationships and dependencies are carried on the entity they start from,
  // so the scene keeps the model's graph rather than flattening it.
  const relationsBySource = new Map<string, string[]>();
  for (const relationship of model.relationships) {
    const existing = relationsBySource.get(relationship.from) ?? [];
    existing.push(`${relationship.kind}:${relationship.to}`);
    relationsBySource.set(relationship.from, existing);
  }
  const requiresBySystem = new Map<string, string[]>();
  for (const dependency of model.dependencies) {
    const existing = requiresBySystem.get(dependency.systemId) ?? [];
    existing.push(...dependency.requires);
    requiresBySystem.set(dependency.systemId, existing);
  }

  const byRole = new Map<WorldRole, typeof claims>();
  for (const claim of claims) {
    const existing = byRole.get(claim.role) ?? [];
    existing.push(claim);
    byRole.set(claim.role, existing);
  }

  const zones: WorldSceneZone[] = [];
  let nodeBudget = MAX_WORLD_SCENE_NODES;
  let zoneIndex = 0;

  for (const [role, roleClaims] of byRole) {
    const entities: WorldSceneEntity[] = [];

    for (const [entityIndex, claim] of roleClaims.entries()) {
      // A Model wrapping one marker Part is two nodes; the zone Folder is one.
      if (nodeBudget < 3) break;

      const nodeName = worldEntityNodeName(claim.id);
      const attributes: Record<string, WorldAttributeValue> = {
        AIStudioWorldEntityId: text(claim.id),
        AIStudioWorldRole: text(claim.role),
        AIStudioWorldSource: text(claim.source),
        AIStudioWorldZone: text(worldZoneName(role)),
        AIStudioWorldModelVersion: {
          kind: "int",
          value: model.schemaVersion,
        },
      };
      if (typeof claim.quantity === "number") {
        attributes.AIStudioWorldQuantity = {
          kind: "int",
          value: claim.quantity,
        };
      }
      const relations = relationsBySource.get(claim.id);
      if (relations && relations.length > 0) {
        attributes.AIStudioWorldRelations = text(relations.join(","));
      }
      const requires = requiresBySystem.get(claim.id);
      if (requires && requires.length > 0) {
        attributes.AIStudioWorldRequires = text(requires.join(","));
      }

      const marker: WorldSceneNode = {
        className: "Part",
        name: "Marker",
        properties: {
          Size: vector3(MARKER_SIZE, MARKER_HEIGHT, MARKER_SIZE),
          Position: vector3(
            entityIndex * ENTITY_SPACING,
            MARKER_HEIGHT / 2,
            zoneIndex * ZONE_SPACING,
          ),
          Anchored: { kind: "bool", value: true },
          // Design-time geometry must never take part in physics or touch
          // events, even if a creator drags it into Workspace to look at it.
          CanCollide: { kind: "bool", value: false },
          CanTouch: { kind: "bool", value: false },
          Color: color3(ROLE_COLOR[role]),
          Transparency: { kind: "number", value: 0.35 },
          Material: {
            kind: "enum",
            enumName: "Material",
            item: ALLOWED_WORLD_ENUM_ITEMS.Material[1],
          },
        },
      };

      entities.push({
        entityId: claim.id,
        role: claim.role,
        node: {
          className: "Model",
          name: nodeName,
          attributes,
          children: [marker],
        },
      });
      nodeBudget -= 2;
    }

    if (entities.length === 0) continue;
    nodeBudget -= 1;
    zones.push({ zoneName: worldZoneName(role), role, entities });
    zoneIndex += 1;
  }

  return {
    sceneVersion: WORLD_SCENE_SCHEMA_VERSION,
    modelSchemaVersion: model.schemaVersion,
    zones,
  };
}
