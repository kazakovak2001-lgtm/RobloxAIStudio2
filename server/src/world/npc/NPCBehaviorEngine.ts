/**
 * NPCBehaviorEngine.ts
 *
 * Goal-driven NPC behavior system.
 * Rule-based logic with adaptive behavior based on world state.
 */

import type { WorldEntity } from "../core/WorldStateEngine";

export interface NPCAction {
  npcId: string;
  action:
    "idle" | "patrol" | "interact" | "trade" | "flee" | "gather" | "quest-give";
  target?: string;
  reason: string;
}

export class NPCBehaviorEngine {
  /**
   * Determine next action for each NPC based on world state.
   */
  computeActions(
    npcs: WorldEntity[],
    playerEntity: WorldEntity | null,
    tick: number,
  ): NPCAction[] {
    const actions: NPCAction[] = [];

    for (const npc of npcs) {
      if (!npc.active) continue;
      const action = this.decideAction(npc, playerEntity, tick);
      actions.push(action);
    }

    return actions;
  }

  private decideAction(
    npc: WorldEntity,
    player: WorldEntity | null,
    tick: number,
  ): NPCAction {
    const role = String(npc.state.role ?? "generic");
    const interactions = Number(npc.state.interactions ?? 0);
    const mood = String(npc.state.mood ?? "neutral");

    // Goal-driven behavior based on role
    switch (role) {
      case "tutorial":
        if (player && interactions === 0) {
          return {
            npcId: npc.id,
            action: "quest-give",
            target: player.id,
            reason: "First interaction — give tutorial quest",
          };
        }
        return {
          npcId: npc.id,
          action: "idle",
          reason: "Tutorial NPC waiting",
        };

      case "merchant":
        if (player && tick % 10 === 0) {
          return {
            npcId: npc.id,
            action: "trade",
            target: player.id,
            reason: "Merchant offering trade",
          };
        }
        return {
          npcId: npc.id,
          action: "idle",
          reason: "Merchant waiting for customers",
        };

      case "guard":
        if (mood === "alert") {
          return {
            npcId: npc.id,
            action: "patrol",
            reason: "Guard on alert patrol",
          };
        }
        return {
          npcId: npc.id,
          action: "patrol",
          reason: "Standard patrol route",
        };

      case "gatherer":
        return {
          npcId: npc.id,
          action: "gather",
          reason: "Collecting resources",
        };

      default:
        // Adaptive: if player is nearby (simulated), attempt interaction
        if (player && tick % 7 === 0 && interactions < 3) {
          return {
            npcId: npc.id,
            action: "interact",
            target: player.id,
            reason: "Approaching player",
          };
        }
        return {
          npcId: npc.id,
          action: tick % 5 === 0 ? "patrol" : "idle",
          reason: "Default behavior",
        };
    }
  }
}
