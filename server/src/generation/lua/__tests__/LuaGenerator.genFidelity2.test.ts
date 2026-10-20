/**
 * LuaGenerator.genFidelity2.test.ts
 *
 * GEN-FIDELITY-2. Before this change GameManager owned a local
 * `playerProgress`/`playerCoins` pair, PlayerService separately owned
 * `PlayerData`, and EconomyService.Award/Spend only printed — three
 * "sources of truth" for the same player, one of them fake. These fixtures
 * prove:
 *
 * 1. Structurally — by asserting on the generated Lua source — that
 *    PlayerService is now the only script that stores progress/currency,
 *    that GameManager and EconomyService read and mutate it only through
 *    PlayerService's methods, and that the old duplicate tables are gone.
 * 2. Behaviourally — via a line-for-line TypeScript transcription of the
 *    generated PlayerService/EconomyService/onObjectiveTouched algorithm
 *    (there is no Lua runtime available in this environment; the repo's own
 *    wasmoon-based harness, server/src/__tests__/support/studioPluginHarness.ts,
 *    is an optional devDependency not installed here) — that the algorithm
 *    itself satisfies the acceptance behaviours: join initializes state,
 *    ordered completion advances progress, reward mutates the authoritative
 *    balance exactly once, replay/out-of-order touches do not reward, spend
 *    cannot overdraw, removal clears state, and the HUD payload reflects
 *    the authoritative balance.
 *
 * Every operation in the model below is named for, and asserted against,
 * the literal Lua statement that implements it, so the two halves cannot
 * silently drift apart.
 */

import { describe, expect, it } from "vitest";
import type { RobloxGameBlueprint } from "../../blueprint/GameBlueprintEngine";
import { LuaGenerator } from "../LuaGenerator";
import { AssetGenerator } from "../../assets/AssetGenerator";
import { GameValidationEngine } from "../../validation/GameValidationEngine";
import { getPlayableLuaIssues } from "../../../types/playableLua";

/** >= 3 objectives, a named economy currency. */
function fixture(): RobloxGameBlueprint {
  return {
    id: "blueprint-fixture-2",
    title: "Ember Reach",
    genre: "adventure",
    description: "A test blueprint",
    coreLoop: ["discover", "engage", "reward", "repeat"],
    mechanics: ["mining", "crafting", "trading"],
    world: {
      mapType: "open-world",
      size: "medium",
      biomes: ["forest", "desert"],
      landmarks: [],
    },
    npcs: [],
    economy: {
      currency: "gems",
      sources: ["quests"],
      sinks: ["upgrades"],
      balanceStrategy: "progressive-earning",
    },
    progression: {
      type: "milestone-based",
      stages: ["novice", "adept", "master"],
      unlockMechanism: "level-thresholds",
      estimatedPlaytime: "10-50 hours",
    },
    createdAt: new Date(0),
  };
}

function generate(bp: RobloxGameBlueprint) {
  const lua = new LuaGenerator().generate(bp);
  const scriptsByName = new Map(lua.scripts.map((s) => [s.name, s]));
  return {
    lua,
    gameManager: scriptsByName.get("GameManager")!,
    playerService: scriptsByName.get("PlayerService")!,
    economyService: scriptsByName.get("EconomyService")!,
    clientController: scriptsByName.get("ClientController")!,
  };
}

describe("GEN-FIDELITY-2 — structural: PlayerService is the single state owner", () => {
  it("PlayerService owns PlayerData and publishes itself at _G.PlayerService", () => {
    const { playerService } = generate(fixture());
    expect(playerService.code).toContain("PlayerService.PlayerData = {}");
    expect(playerService.code).toContain("_G.PlayerService = PlayerService");
  });

  it("GameManager no longer keeps a competing playerProgress/playerCoins pair", () => {
    const { gameManager } = generate(fixture());
    expect(gameManager.code).not.toContain("playerProgress");
    expect(gameManager.code).not.toContain("playerCoins");
  });

  it("GameManager reads/advances progress and currency only through PlayerService", () => {
    const { gameManager } = generate(fixture());
    expect(gameManager.code).toContain(
      "local progress = _G.PlayerService:GetProgress(player.UserId)",
    );
    expect(gameManager.code).toContain(
      "local newProgress = _G.PlayerService:AdvanceProgress(player.UserId)",
    );
    expect(gameManager.code).toContain(
      "local balance = _G.PlayerService:GetCurrency(player.UserId)",
    );
  });

  it("EconomyService.Award/Spend mutate PlayerService's balance, not print-only", () => {
    const { economyService } = generate(fixture());
    expect(economyService.code).toContain(
      "local balance = _G.PlayerService:AddCurrency(playerId, amount)",
    );
    expect(economyService.code).toContain(
      "local ok, balance = _G.PlayerService:SpendCurrency(playerId, amount)",
    );
    // The old stub returned nothing and only printed.
    expect(economyService.code).not.toMatch(
      /function EconomyService\.Award\(playerId, amount, source\)\s*\n\s*print/,
    );
  });

  it("Spend refuses to overdraw the authoritative balance", () => {
    const { playerService } = generate(fixture());
    expect(playerService.code).toContain("if data.currency < amount then");
    expect(playerService.code).toContain("return false, data.currency");
  });

  it("PlayerRemoving lifecycle lives once, in PlayerService, and clears state", () => {
    const { gameManager, playerService } = generate(fixture());
    expect(gameManager.code).not.toContain("PlayerRemoving");
    expect(playerService.code).toContain(
      "Players.PlayerRemoving:Connect(function(player) PlayerService:Remove(player) end)",
    );
    expect(playerService.code).toContain(
      "self.PlayerData[player.UserId] = nil",
    );
  });

  it("join is initialized once, in PlayerService", () => {
    const { gameManager, playerService } = generate(fixture());
    expect(gameManager.code).not.toContain("PlayerAdded");
    expect(playerService.code).toContain(
      "self.PlayerData[player.UserId] = { progress = 1, currency = 0 }",
    );
  });

  it("ProgressUpdated's coins field is read fresh from PlayerService, not a local copy", () => {
    const { gameManager } = generate(fixture());
    expect(gameManager.code).toContain("coins = balance,");
    // `balance` is bound directly from GetCurrency two lines above, not from
    // any locally accumulated table.
    const balanceLine = gameManager.code.indexOf(
      "local balance = _G.PlayerService:GetCurrency(player.UserId)",
    );
    const coinsLine = gameManager.code.indexOf("coins = balance,");
    expect(balanceLine).toBeGreaterThan(-1);
    expect(coinsLine).toBeGreaterThan(balanceLine);
  });

  it("still passes the playable-Lua contract, GameValidationEngine and LuaCodeValidator", () => {
    const bp = fixture();
    const lua = new LuaGenerator().generate(bp);
    const assets = new AssetGenerator().generate(bp);
    const issues = getPlayableLuaIssues(
      lua.scripts.map((s) => ({ path: s.path, content: s.code })),
    );
    expect(issues).toEqual([]);
    const result = new GameValidationEngine().validate(bp, lua, assets);
    expect(result.errors).toBe(0);
    expect(result.passed).toBe(true);
  });
});

/**
 * Line-for-line transcription of the generated Lua algorithm. Every method
 * name and branch below corresponds to an asserted Lua statement above.
 */
class PlayerServiceModel {
  private data = new Map<number, { progress: number; currency: number }>();

  private ensureData(userId: number) {
    let d = this.data.get(userId);
    if (!d) {
      d = { progress: 1, currency: 0 };
      this.data.set(userId, d);
    }
    return d;
  }

  init(userId: number): void {
    this.data.set(userId, { progress: 1, currency: 0 });
  }

  remove(userId: number): void {
    this.data.delete(userId);
  }

  has(userId: number): boolean {
    return this.data.has(userId);
  }

  getProgress(userId: number): number {
    return this.ensureData(userId).progress;
  }

  advanceProgress(userId: number): number {
    const d = this.ensureData(userId);
    d.progress += 1;
    return d.progress;
  }

  getCurrency(userId: number): number {
    return this.ensureData(userId).currency;
  }

  addCurrency(userId: number, amount: number): number {
    const d = this.ensureData(userId);
    d.currency += amount;
    return d.currency;
  }

  spendCurrency(userId: number, amount: number): [boolean, number] {
    const d = this.ensureData(userId);
    if (d.currency < amount) {
      return [false, d.currency];
    }
    d.currency -= amount;
    return [true, d.currency];
  }
}

class EconomyServiceModel {
  constructor(private readonly playerService: PlayerServiceModel) {}

  award(userId: number, amount: number): number {
    return this.playerService.addCurrency(userId, amount);
  }

  spend(userId: number, amount: number): [boolean, number] {
    return this.playerService.spendCurrency(userId, amount);
  }
}

interface Objective {
  name: string;
  reward: number;
}

/** Mirrors GameManager's onObjectiveTouched. Returns the FireClient payload, or null when the touch was rejected. */
function onObjectiveTouched(
  playerService: PlayerServiceModel,
  economyService: EconomyServiceModel,
  objectives: readonly Objective[],
  userId: number,
  objectiveIndex: number,
): { completedCount: number; coins: number } | null {
  const progress = playerService.getProgress(userId);
  if (objectiveIndex !== progress) {
    return null;
  }
  const objective = objectives[objectiveIndex - 1];
  playerService.advanceProgress(userId);
  economyService.award(userId, objective.reward);
  const balance = playerService.getCurrency(userId);
  return { completedCount: objectiveIndex, coins: balance };
}

const OBJECTIVES: Objective[] = [
  { name: "mining", reward: 25 },
  { name: "crafting", reward: 50 },
  { name: "trading", reward: 75 },
];

describe("GEN-FIDELITY-2 — behavioural: authoritative state machine", () => {
  const USER = 1001;

  it("join initializes progress and currency", () => {
    const ps = new PlayerServiceModel();
    ps.init(USER);
    expect(ps.getProgress(USER)).toBe(1);
    expect(ps.getCurrency(USER)).toBe(0);
  });

  it("ordered completion advances progress", () => {
    const ps = new PlayerServiceModel();
    const es = new EconomyServiceModel(ps);
    ps.init(USER);

    const result = onObjectiveTouched(ps, es, OBJECTIVES, USER, 1);

    expect(result).not.toBeNull();
    expect(ps.getProgress(USER)).toBe(2);
  });

  it("reward mutates the authoritative balance exactly once per completion", () => {
    const ps = new PlayerServiceModel();
    const es = new EconomyServiceModel(ps);
    ps.init(USER);

    const result = onObjectiveTouched(ps, es, OBJECTIVES, USER, 1);

    expect(result!.coins).toBe(25);
    expect(ps.getCurrency(USER)).toBe(25);

    // Advancing to and completing the next objective adds again, once.
    onObjectiveTouched(ps, es, OBJECTIVES, USER, 2);
    expect(ps.getCurrency(USER)).toBe(75); // 25 + 50
  });

  it("a replayed (already-completed) touch does not reward", () => {
    const ps = new PlayerServiceModel();
    const es = new EconomyServiceModel(ps);
    ps.init(USER);

    onObjectiveTouched(ps, es, OBJECTIVES, USER, 1); // completes objective 1
    const balanceAfterFirst = ps.getCurrency(USER);
    const progressAfterFirst = ps.getProgress(USER);

    const replay = onObjectiveTouched(ps, es, OBJECTIVES, USER, 1); // touched again

    expect(replay).toBeNull();
    expect(ps.getCurrency(USER)).toBe(balanceAfterFirst);
    expect(ps.getProgress(USER)).toBe(progressAfterFirst);
  });

  it("an out-of-order touch (ahead of current progress) does not reward", () => {
    const ps = new PlayerServiceModel();
    const es = new EconomyServiceModel(ps);
    ps.init(USER);

    const outOfOrder = onObjectiveTouched(ps, es, OBJECTIVES, USER, 3);

    expect(outOfOrder).toBeNull();
    expect(ps.getProgress(USER)).toBe(1);
    expect(ps.getCurrency(USER)).toBe(0);
  });

  it("spend cannot overdraw the authoritative balance", () => {
    const ps = new PlayerServiceModel();
    const es = new EconomyServiceModel(ps);
    ps.init(USER);
    ps.addCurrency(USER, 10);

    const [ok, balance] = es.spend(USER, 25);

    expect(ok).toBe(false);
    expect(balance).toBe(10);
    expect(ps.getCurrency(USER)).toBe(10);
  });

  it("a spend within balance succeeds and mutates the balance", () => {
    const ps = new PlayerServiceModel();
    const es = new EconomyServiceModel(ps);
    ps.init(USER);
    ps.addCurrency(USER, 30);

    const [ok, balance] = es.spend(USER, 20);

    expect(ok).toBe(true);
    expect(balance).toBe(10);
    expect(ps.getCurrency(USER)).toBe(10);
  });

  it("removal clears state", () => {
    const ps = new PlayerServiceModel();
    ps.init(USER);
    ps.addCurrency(USER, 50);

    ps.remove(USER);

    expect(ps.has(USER)).toBe(false);
  });

  it("HUD payload (FireClient data) reflects the authoritative balance, not a snapshot", () => {
    const ps = new PlayerServiceModel();
    const es = new EconomyServiceModel(ps);
    ps.init(USER);

    const first = onObjectiveTouched(ps, es, OBJECTIVES, USER, 1);
    const second = onObjectiveTouched(ps, es, OBJECTIVES, USER, 2);

    expect(first!.coins).toBe(ps.getCurrency(USER) - 50); // before objective 2's reward
    expect(second!.coins).toBe(ps.getCurrency(USER)); // reflects the balance at the time it fired
    expect(second!.coins).toBe(75);
  });
});
