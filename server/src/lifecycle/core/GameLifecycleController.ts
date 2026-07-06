/**
 * GameLifecycleController.ts
 *
 * Orchestrates the full game lifecycle: creation → simulation → evolution → maintenance.
 * State machine driving long-term autonomous game management.
 */

export type LifecycleState =
  "CREATED" | "SIMULATED" | "BALANCED" | "ACTIVE" | "EVOLVING" | "DEPRECATED";

export interface GameLifecycle {
  gameId: string;
  state: LifecycleState;
  version: number;
  createdAt: Date;
  lastUpdatedAt: Date;
  tickCount: number;
  patchCount: number;
  healthScore: number;
}

export class GameLifecycleController {
  private games = new Map<string, GameLifecycle>();

  /**
   * Start lifecycle tracking for a generated game.
   */
  start(gameId: string): GameLifecycle {
    const lifecycle: GameLifecycle = {
      gameId,
      state: "CREATED",
      version: 1,
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      tickCount: 0,
      patchCount: 0,
      healthScore: 100,
    };
    this.games.set(gameId, lifecycle);
    console.log(`[LIFECYCLE] Started | Game: ${gameId} | State: CREATED`);
    return lifecycle;
  }

  /**
   * Transition game to next lifecycle state.
   */
  transition(gameId: string, newState: LifecycleState): GameLifecycle | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    const validTransitions: Record<LifecycleState, LifecycleState[]> = {
      CREATED: ["SIMULATED"],
      SIMULATED: ["BALANCED"],
      BALANCED: ["ACTIVE"],
      ACTIVE: ["EVOLVING", "DEPRECATED"],
      EVOLVING: ["ACTIVE", "DEPRECATED"],
      DEPRECATED: [],
    };

    if (!validTransitions[game.state].includes(newState)) {
      console.warn(
        `[LIFECYCLE] Invalid transition: ${game.state} → ${newState}`,
      );
      return null;
    }

    game.state = newState;
    game.lastUpdatedAt = new Date();
    console.log(
      `[LIFECYCLE] Transition | Game: ${gameId} | ${game.state} → ${newState}`,
    );
    return game;
  }

  /**
   * Record a lifecycle tick (periodic maintenance cycle).
   */
  tick(gameId: string): void {
    const game = this.games.get(gameId);
    if (game) {
      game.tickCount++;
      game.lastUpdatedAt = new Date();
    }
  }

  /**
   * Record a patch applied to the game.
   */
  recordPatch(gameId: string): void {
    const game = this.games.get(gameId);
    if (game) {
      game.patchCount++;
      game.version++;
      game.lastUpdatedAt = new Date();
    }
  }

  /**
   * Update health score from monitoring.
   */
  updateHealth(gameId: string, score: number): void {
    const game = this.games.get(gameId);
    if (game) game.healthScore = Math.max(0, Math.min(100, score));
  }

  getLifecycle(gameId: string): GameLifecycle | null {
    return this.games.get(gameId) ?? null;
  }

  listActive(): GameLifecycle[] {
    return Array.from(this.games.values()).filter(
      (g) => g.state !== "DEPRECATED",
    );
  }

  get gameCount(): number {
    return this.games.size;
  }
}
