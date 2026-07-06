/**
 * EmergentBehaviorEngine.ts
 *
 * Detects unexpected patterns from world simulation:
 * farming loops, NPC clustering, economy exploits, meta-strategies.
 */

import type { InteractionGraph } from "../interaction/InteractionGraphEngine";
import type { WorldState } from "../core/WorldStateEngine";

export interface EmergentPhenomenon {
  id: string;
  type:
    | "farming-loop"
    | "npc-cluster"
    | "economy-exploit"
    | "meta-strategy"
    | "dead-zone"
    | "interaction-loop";
  severity: "low" | "medium" | "high";
  description: string;
  involvedEntities: string[];
  detectedAt: number; // tick
}

export interface EmergenceReport {
  phenomena: EmergentPhenomenon[];
  totalDetected: number;
  highSeverity: number;
  worldStability: number; // 0–100
}

export class EmergentBehaviorEngine {
  private counter = 0;

  /**
   * Analyze world state + interaction graph for emergent phenomena.
   */
  detect(state: WorldState, graph: InteractionGraph): EmergenceReport {
    const phenomena: EmergentPhenomenon[] = [];

    this.detectFarmingLoops(graph, state.tick, phenomena);
    this.detectNPCClustering(state, phenomena);
    this.detectDeadZones(state, phenomena);
    this.detectInteractionLoops(graph, state.tick, phenomena);

    const highSeverity = phenomena.filter((p) => p.severity === "high").length;
    const worldStability = Math.max(
      0,
      100 - highSeverity * 20 - phenomena.length * 5,
    );

    console.log(
      `[EMERGENCE] Detected: ${phenomena.length} phenomena | Stability: ${worldStability}`,
    );

    return {
      phenomena,
      totalDetected: phenomena.length,
      highSeverity,
      worldStability,
    };
  }

  private detectFarmingLoops(
    graph: InteractionGraph,
    tick: number,
    out: EmergentPhenomenon[],
  ): void {
    // A farming loop: same interaction repeated 10+ times
    for (const edge of graph.edges) {
      if (edge.weight >= 10 && edge.type === "gather") {
        this.counter++;
        out.push({
          id: `emg-${this.counter}`,
          type: "farming-loop",
          severity: "medium",
          description: `Farming loop detected: ${edge.from} repeatedly gathering (×${edge.weight})`,
          involvedEntities: [edge.from, edge.to],
          detectedAt: tick,
        });
      }
    }
  }

  private detectNPCClustering(
    state: WorldState,
    out: EmergentPhenomenon[],
  ): void {
    const npcs = Array.from(state.entities.values()).filter(
      (e) => e.type === "npc" && e.active,
    );
    if (npcs.length < 3) return;

    // Simple clustering: count NPCs within 20 units of each other
    for (let i = 0; i < npcs.length; i++) {
      const nearby = npcs.filter(
        (n, j) => j !== i && this.distance(npcs[i].position, n.position) < 20,
      );
      if (nearby.length >= 3) {
        this.counter++;
        out.push({
          id: `emg-${this.counter}`,
          type: "npc-cluster",
          severity: "low",
          description: `NPC cluster: ${nearby.length + 1} NPCs within 20 units of ${npcs[i].name}`,
          involvedEntities: [npcs[i].id, ...nearby.map((n) => n.id)],
          detectedAt: state.tick,
        });
        break; // One cluster report per tick
      }
    }
  }

  private detectDeadZones(state: WorldState, out: EmergentPhenomenon[]): void {
    // Zones with no active entities
    for (const zone of state.zones) {
      const entitiesInZone = Array.from(state.entities.values()).filter(
        (e) => e.active && String(e.state.zone) === zone,
      );
      if (entitiesInZone.length === 0 && state.tick > 30) {
        this.counter++;
        out.push({
          id: `emg-${this.counter}`,
          type: "dead-zone",
          severity: "medium",
          description: `Dead zone detected: "${zone}" has no active entities`,
          involvedEntities: [],
          detectedAt: state.tick,
        });
      }
    }
  }

  private detectInteractionLoops(
    graph: InteractionGraph,
    tick: number,
    out: EmergentPhenomenon[],
  ): void {
    if (graph.dominantLoop && graph.totalInteractions > 20) {
      this.counter++;
      out.push({
        id: `emg-${this.counter}`,
        type: "interaction-loop",
        severity: "high",
        description: `Dominant interaction loop: ${graph.dominantLoop}`,
        involvedEntities: graph.hotspots.slice(0, 3),
        detectedAt: tick,
      });
    }
  }

  private distance(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }
}
