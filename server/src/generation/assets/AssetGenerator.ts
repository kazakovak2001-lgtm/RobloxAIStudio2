/**
 * AssetGenerator.ts
 *
 * Generates asset layout, object placement rules, NPC spawns,
 * and environment composition from a GameBlueprint.
 * No actual 3D generation — produces placement data for Studio.
 */

import type { RobloxGameBlueprint } from "../blueprint/GameBlueprintEngine";

export interface AssetPlacement {
  id: string;
  type: "model" | "spawn" | "npc" | "prop" | "terrain" | "light";
  name: string;
  position: { x: number; y: number; z: number };
  properties: Record<string, unknown>;
}

export interface AssetLayout {
  blueprintId: string;
  placements: AssetPlacement[];
  spawnPoints: AssetPlacement[];
  npcSpawns: AssetPlacement[];
  environmentObjects: AssetPlacement[];
  totalObjects: number;
}

export class AssetGenerator {
  /**
   * Generate a complete asset layout from a blueprint.
   */
  generate(blueprint: RobloxGameBlueprint): AssetLayout {
    const placements: AssetPlacement[] = [];
    const spawnPoints: AssetPlacement[] = [];
    const npcSpawns: AssetPlacement[] = [];
    const environmentObjects: AssetPlacement[] = [];

    // Player spawn point
    spawnPoints.push({
      id: "spawn-main",
      type: "spawn",
      name: "MainSpawn",
      position: { x: 0, y: 5, z: 0 },
      properties: { Anchored: true, CanCollide: true },
    });

    // NPC spawn positions (spread around spawn)
    for (let i = 0; i < blueprint.npcs.length; i++) {
      const npc = blueprint.npcs[i];
      const angle = (i / blueprint.npcs.length) * Math.PI * 2;
      npcSpawns.push({
        id: `npc-spawn-${npc.id}`,
        type: "npc",
        name: npc.name,
        position: { x: Math.cos(angle) * 20, y: 0, z: Math.sin(angle) * 20 },
        properties: { role: npc.role, behavior: npc.behavior },
      });
    }

    // Environment per biome
    for (let i = 0; i < blueprint.world.biomes.length; i++) {
      const biome = blueprint.world.biomes[i];
      environmentObjects.push({
        id: `env-${biome}`,
        type: "terrain",
        name: `${biome}_zone`,
        position: { x: i * 100, y: 0, z: 0 },
        properties: { biome, size: blueprint.world.size },
      });
    }

    // Props per mechanic
    for (let i = 0; i < blueprint.mechanics.length; i++) {
      const mechanic = blueprint.mechanics[i];
      placements.push({
        id: `prop-${mechanic}`,
        type: "prop",
        name: `${mechanic}_interactable`,
        position: { x: i * 15, y: 0, z: 30 },
        properties: { mechanic, interactable: true },
      });
    }

    // Lighting
    environmentObjects.push({
      id: "light-main",
      type: "light",
      name: "GlobalLighting",
      position: { x: 0, y: 100, z: 0 },
      properties: {
        Ambient: "0.3, 0.3, 0.3",
        Brightness: 2,
        TimeOfDay: "14:00",
      },
    });

    const all = [
      ...placements,
      ...spawnPoints,
      ...npcSpawns,
      ...environmentObjects,
    ];

    console.log(
      `[ASSET-GEN] Generated | Blueprint: ${blueprint.id} | Objects: ${all.length}`,
    );

    return {
      blueprintId: blueprint.id,
      placements,
      spawnPoints,
      npcSpawns,
      environmentObjects,
      totalObjects: all.length,
    };
  }
}
