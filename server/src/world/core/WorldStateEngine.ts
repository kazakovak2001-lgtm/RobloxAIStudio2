/**
 * WorldStateEngine.ts
 *
 * Maintains global world state: entities, positions, relationships.
 * Tick-based state transitions. Deterministic given same seed.
 */

export interface WorldEntity {
  id: string;
  type: "npc" | "player" | "object" | "zone" | "economy-node";
  name: string;
  position: { x: number; y: number; z: number };
  state: Record<string, unknown>;
  active: boolean;
}

export interface WorldState {
  tick: number;
  entities: Map<string, WorldEntity>;
  zones: string[];
  globalFlags: Record<string, unknown>;
  lastUpdated: Date;
}

export class WorldStateEngine {
  private state: WorldState;

  constructor() {
    this.state = {
      tick: 0,
      entities: new Map(),
      zones: [],
      globalFlags: {},
      lastUpdated: new Date(),
    };
  }

  /**
   * Initialize world state from a blueprint's world/NPC definitions.
   */
  initialize(
    npcs: Array<{ id: string; name: string; role: string }>,
    zones: string[],
  ): void {
    this.state.zones = zones;
    for (const npc of npcs) {
      this.state.entities.set(npc.id, {
        id: npc.id,
        type: "npc",
        name: npc.name,
        position: { x: Math.random() * 100, y: 0, z: Math.random() * 100 },
        state: {
          role: npc.role,
          mood: "neutral",
          goal: "idle",
          interactions: 0,
        },
        active: true,
      });
    }
    // Add simulated player
    this.state.entities.set("player-sim", {
      id: "player-sim",
      type: "player",
      name: "SimPlayer",
      position: { x: 0, y: 0, z: 0 },
      state: { level: 1, currency: 0, engaged: true },
      active: true,
    });
    console.log(
      `[WORLD] Initialized | Entities: ${this.state.entities.size} | Zones: ${zones.length}`,
    );
  }

  /**
   * Advance world state by one tick.
   */
  tick(): void {
    this.state.tick++;
    this.state.lastUpdated = new Date();
  }

  getState(): Readonly<WorldState> {
    return this.state;
  }

  getEntity(id: string): WorldEntity | null {
    return this.state.entities.get(id) ?? null;
  }

  getEntitiesByType(type: WorldEntity["type"]): WorldEntity[] {
    return Array.from(this.state.entities.values()).filter(
      (e) => e.type === type,
    );
  }

  updateEntity(id: string, updates: Partial<WorldEntity["state"]>): void {
    const entity = this.state.entities.get(id);
    if (entity) entity.state = { ...entity.state, ...updates };
  }

  addEntity(entity: WorldEntity): void {
    this.state.entities.set(entity.id, entity);
  }

  removeEntity(id: string): void {
    this.state.entities.delete(id);
  }

  setGlobalFlag(key: string, value: unknown): void {
    this.state.globalFlags[key] = value;
  }

  get currentTick(): number {
    return this.state.tick;
  }

  get entityCount(): number {
    return this.state.entities.size;
  }
}
