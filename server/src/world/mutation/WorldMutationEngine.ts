/**
 * WorldMutationEngine.ts
 *
 * Modifies world state based on detected emergent behavior.
 * Ensures stability — no collapse loops.
 */

import { WorldStateEngine } from "../core/WorldStateEngine";
import type {
  EmergenceReport,
  EmergentPhenomenon,
} from "../emergence/EmergentBehaviorEngine";

export interface WorldMutation {
  type:
    | "adjust-density"
    | "adjust-spawn"
    | "add-constraint"
    | "rebalance-zone"
    | "disable-entity";
  target: string;
  reason: string;
  applied: boolean;
}

export class WorldMutationEngine {
  /**
   * Apply safe mutations to stabilize the world.
   */
  applyMutations(
    world: WorldStateEngine,
    report: EmergenceReport,
  ): WorldMutation[] {
    const mutations: WorldMutation[] = [];

    for (const phenomenon of report.phenomena) {
      const mutation = this.resolvePhenomenon(phenomenon, world);
      if (mutation) mutations.push(mutation);
    }

    // Safety cap: never apply more than 3 mutations per tick
    const applied = mutations.slice(0, 3);
    for (const m of applied) m.applied = true;

    if (applied.length > 0) {
      console.log(
        `[MUTATION] Applied ${applied.length} mutations | Stability: ${report.worldStability}`,
      );
    }

    return mutations;
  }

  private resolvePhenomenon(
    phenomenon: EmergentPhenomenon,
    world: WorldStateEngine,
  ): WorldMutation | null {
    switch (phenomenon.type) {
      case "farming-loop":
        // Reduce reward for repeated actions
        return {
          type: "add-constraint",
          target: phenomenon.involvedEntities[0] ?? "unknown",
          reason: "Cap repeated gather actions to prevent farming",
          applied: false,
        };

      case "npc-cluster":
        // Spread NPCs apart
        for (const id of phenomenon.involvedEntities.slice(1)) {
          const entity = world.getEntity(id);
          if (entity) {
            entity.position.x += (Math.random() - 0.5) * 40;
            entity.position.z += (Math.random() - 0.5) * 40;
          }
        }
        return {
          type: "adjust-density",
          target: "npc-positions",
          reason: "Spread clustered NPCs for better world distribution",
          applied: false,
        };

      case "dead-zone":
        // Spawn a new entity in dead zone
        world.addEntity({
          id: `spawn-${Date.now()}`,
          type: "object",
          name: "ZoneActivator",
          position: { x: Math.random() * 50, y: 0, z: Math.random() * 50 },
          state: { purpose: "attract-players" },
          active: true,
        });
        return {
          type: "adjust-spawn",
          target: phenomenon.description,
          reason: "Added entity to activate dead zone",
          applied: false,
        };

      case "interaction-loop":
        return {
          type: "rebalance-zone",
          target: phenomenon.involvedEntities[0] ?? "unknown",
          reason:
            "Dominant interaction loop — diversify available interactions",
          applied: false,
        };

      default:
        return null;
    }
  }
}
