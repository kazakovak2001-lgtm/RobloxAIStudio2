import type { GameBlueprint } from "../types/blueprint";
import type { GameDesignSeed } from "../types/blueprint";

export type SimilarityResult = {
  score: number; // 0..1 (higher = more similar)
  reason?: string;
};

const historyByUser = new Map<string, GameDesignSeed[]>();

function hashStringToInt(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getBlueprintGameType(blueprint: GameBlueprint): string | undefined {
  // GameBlueprint uses snake_case fields.
  return (blueprint as any).game_type;
}

function getSeedPool(blueprint: GameBlueprint) {
  // blueprint.genre can be string[] in schema; normalize to string[] tokens.
  const blueprintGenres: string[] = Array.isArray(blueprint.genre)
    ? blueprint.genre
    : typeof blueprint.genre === "string"
      ? [blueprint.genre]
      : [];

  const genres = Array.from(new Set(blueprintGenres));

  const coreLoops = [
    "explore → discover → upgrade → repeat",
    "collect → craft → specialize → expedition",
    "route planning → encounters → resource control",
    "build a base → defend → expand → ecosystem",
    "quest chain → choices → consequence-based scaling",
    "factory automation → throughput → optimization sprint",
    "social hub → alliances → territory rotation",
  ];

  const mechanics = [
    "procedural quest directives",
    "timed decision checkpoints",
    "combo-based traversal",
    "dynamic faction reputation",
    "risk/reward resource storms",
    "modular loadout crafting",
    "physics-driven puzzle beats",
    "asymmetric co-op roles",
    "skill-tree with tradeoffs",
    "event-driven economy shocks",
    "roguelite run modifiers",
    "arena wave escalation",
    "tower-defense inspired lanes",
    "stealth route variants",
    "base-building production lines",
  ];

  const themes = [
    "aurora ruins",
    "neon skyports",
    "verdant labyrinth",
    "starforge colonies",
    "winter circuit",
    "stormglass docks",
  ];

  const innovationModifiers = [
    "choice-driven branching progression",
    "mechanic inversion after milestones",
    "contextual UI that changes with objectives",
    "economy reacts to player-driven events",
    "encounter patterns adapt to playstyle clusters",
    "progression unlocks alternate versions of mechanics",
    "weather-like modifiers that reshape traversal",
  ];

  const constraints = [
    "readable objectives",
    "short sessions supported",
    "anti-grind pacing",
    "clear fail states",
    "single-player and co-op compatible",
  ];

  return {
    genres,
    coreLoops,
    mechanics,
    themes,
    innovationModifiers,
    constraints,
  };
}

function buildSeed(
  blueprint: GameBlueprint,
  executionId: string,
  userId: string,
): GameDesignSeed {
  const pool = getSeedPool(blueprint);
  const seedInput = [
    userId,
    blueprint.id,
    blueprint.genre,
    getBlueprintGameType(blueprint) ?? "",
    executionId,
  ].join("|");
  const rnd = mulberry32(hashStringToInt(seedInput));

  const genre =
    typeof blueprint.genre === "string"
      ? blueprint.genre
      : pick(pool.genres, rnd);
  const coreLoop = pick(pool.coreLoops, rnd);
  const theme = pick(pool.themes, rnd);
  const innovationModifiers = shuffle(pool.innovationModifiers, rnd).slice(
    0,
    3,
  );
  const mechanics = shuffle(pool.mechanics, rnd).slice(0, 5);
  const constraints = shuffle(pool.constraints, rnd).slice(0, 4);

  return {
    genre,
    coreLoop,
    mechanics,
    constraints,
    theme,
    innovationModifiers,
  };
}

function tokenVector(seed: GameDesignSeed) {
  const loopTokens = seed.coreLoop
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)
    .slice(0, 12);
  const mechTokens = seed.mechanics
    .map((m: string) => m.toLowerCase())
    .join(" ")
    .split(/\W+/)
    .filter(Boolean)
    .slice(0, 24);

  const innovationTokens = seed.innovationModifiers
    .map((m) => m.toLowerCase())
    .join(" ")
    .split(/\W+/)
    .filter(Boolean)
    .slice(0, 18);

  return {
    loopTokens,
    mechTokens,
    genre: String(seed.genre).toLowerCase(),
    theme: String(seed.theme).toLowerCase(),
    innovationTokens,
  };
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function computeSeedSimilarity(
  a: GameDesignSeed,
  b: GameDesignSeed,
): SimilarityResult {
  const va = tokenVector(a);
  const vb = tokenVector(b);

  const loopSim = jaccard(va.loopTokens, vb.loopTokens);
  const mechSim = jaccard(va.mechTokens, vb.mechTokens);
  const genreSim = va.genre === vb.genre ? 1 : 0;
  const themeSim = va.theme === vb.theme ? 1 : 0;
  const innovSim = jaccard(va.innovationTokens, vb.innovationTokens);

  const score = clamp(
    0.45 * loopSim +
      0.45 * mechSim +
      (0.1 * (genreSim + themeSim)) / 2 +
      0.05 * innovSim,
    0,
    1,
  );

  return {
    score,
    reason: score > 0.75 ? "Highly similar loop+mechanics" : undefined,
  };
}

export function generateGameDesignSeed(options: {
  blueprint: GameBlueprint;
  executionId: string;
  userId: string;
  targetMaxSimilarity?: number;
  maxAttempts?: number;
}): GameDesignSeed {
  const {
    blueprint,
    executionId,
    userId,
    targetMaxSimilarity = 0.6,
    maxAttempts = 8,
  } = options;

  const history = historyByUser.get(userId) ?? [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = buildSeed(
      blueprint,
      `${executionId}::${attempt}`,
      userId,
    );

    let best = 0;
    for (const prev of history) {
      const sim = computeSeedSimilarity(candidate, prev).score;
      if (sim > best) best = sim;
    }

    if (history.length === 0 || best <= targetMaxSimilarity) {
      historyByUser.set(userId, [...history, candidate].slice(-20));
      return candidate;
    }
  }

  const fallback = buildSeed(blueprint, `${executionId}::fallback`, userId);
  historyByUser.set(userId, [...history, fallback].slice(-20));
  return fallback;
}

export function clearUserDiversityHistory(userId: string) {
  historyByUser.delete(userId);
}
