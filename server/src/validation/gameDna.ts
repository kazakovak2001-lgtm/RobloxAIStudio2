import { createHash } from "crypto";

import {
  WORLD_CONSTRAINT_KINDS,
  WORLD_RELATION_KINDS,
  WORLD_ROLES,
  type WorldConstraintKind,
  type WorldModel,
  type WorldRelationKind,
  type WorldRole,
} from "./worldModel";

/**
 * NOVELTY-1 — a structural fingerprint of one generated game.
 *
 * The platform already had a diversity mechanism, and it measured the wrong
 * thing: `gameDiversityEngine` compares the *seed* the platform invented for
 * itself before any agent ran, so two structurally identical games built from
 * different seeds read as different. This is the first thing that compares one
 * generation's structure to another's.
 *
 * Everything here is derived from the world model. Nothing is invented, and no
 * component reads free text — a digest that moved when a model reworded a
 * sentence would be measuring prose, not structure.
 */

/** Bumped when the derivation or the encoding changes, never for a rename. */
export const GAME_DNA_SCHEMA_VERSION = 1;

/**
 * How a DNA was compared against the generations before it.
 *
 * `no-prior-generations` and `prior-without-dna` are separate states on
 * purpose. Both mean "no comparison happened", and collapsing either into a
 * novelty claim is the failure `SECURITY-REVIEW-A2` had to correct: a first
 * generation in a project is not novel, it is uncompared.
 */
export const DNA_COMPARISON_OUTCOMES = [
  "compared",
  "no-prior-generations",
  "prior-without-dna",
] as const;
export type DnaComparisonOutcome = (typeof DNA_COMPARISON_OUTCOMES)[number];

/** A count per member of a closed set. Absent members are recorded as zero. */
export type Distribution<K extends string> = Readonly<Record<K, number>>;

export interface GameDna {
  readonly schemaVersion: number;
  /** How many systems and entities hold each `WorldRole`. */
  readonly roles: Distribution<WorldRole>;
  /**
   * How many relationships hold each kind.
   *
   * `buildWorldModel` emits exactly one relationship shape today — an API
   * contract notifying the presentation system — so in practice this counts
   * declared contracts. It is kept as a distribution rather than a count
   * because the kind set is closed and a second kind changes the meaning of
   * the number rather than adding to it.
   */
  readonly relationKinds: Distribution<WorldRelationKind>;
  /** How many constraints hold each kind. */
  readonly constraintKinds: Distribution<WorldConstraintKind>;
  // The dependency graph is deliberately NOT fingerprinted. `buildWorldModel`
  // has one `dependencies.push` site — every progress-signal system requires
  // the single `presentation` system — so the graph is always a star, its node
  // and edge counts are a function of `roles["progress-signal"]`, and a degree
  // profile over it is one number repeated. Fingerprinting it would add three
  // fields carrying no information the role distribution does not already
  // hold. When the model gains real edges between systems, this is where a
  // graph component belongs.
  readonly systemCount: number;
  readonly entityCount: number;
  /**
   * Presence only. `buildWorldModel` emits at most one progression and one
   * scoring system, each carrying a sentence copied from the design. Whether
   * they exist is structure; what they say is prose, so only the first is
   * fingerprinted.
   */
  readonly declares: {
    readonly progression: boolean;
    readonly scoring: boolean;
  };
}

export interface GameDnaComponentDistance {
  readonly component: string;
  /** 0 identical, 1 maximally different. */
  readonly distance: number;
}

export interface GameDnaComparison {
  readonly distance: number;
  readonly components: readonly GameDnaComponentDistance[];
}

function emptyDistribution<K extends string>(
  keys: readonly K[],
): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

/**
 * Derive the DNA of one generated game.
 *
 * Total: any world model produces a DNA, including an empty one. A world that
 * claims nothing has a DNA of all zeros, which is a real answer and compares
 * as such — refusing here would leave the caller with nothing to record.
 */
export function buildGameDna(world: WorldModel): GameDna {
  const roles = emptyDistribution(WORLD_ROLES);
  for (const system of world.systems) {
    if (system.role in roles) roles[system.role] += 1;
  }
  for (const entity of world.entities) {
    if (entity.role in roles) roles[entity.role] += 1;
  }

  const relationKinds = emptyDistribution(WORLD_RELATION_KINDS);
  for (const relationship of world.relationships) {
    if (relationship.kind in relationKinds)
      relationKinds[relationship.kind] += 1;
  }

  const constraintKinds = emptyDistribution(WORLD_CONSTRAINT_KINDS);
  for (const constraint of world.constraints) {
    if (constraint.kind in constraintKinds) {
      constraintKinds[constraint.kind] += 1;
    }
  }

  return {
    schemaVersion: GAME_DNA_SCHEMA_VERSION,
    roles,
    relationKinds,
    constraintKinds,
    systemCount: world.systems.length,
    entityCount: world.entities.length,
    declares: {
      progression: world.systems.some((system) => system.id === "progression"),
      scoring: world.systems.some((system) => system.id === "scoring"),
    },
  };
}

/**
 * The exact bytes the fingerprint is taken over.
 *
 * Written as sorted, readable lines rather than serialized structure so that
 * what is inside a fingerprint can be read instead of inferred. A field that
 * does not appear here is not fingerprinted, and that is checkable by eye.
 */
export function encodeGameDna(dna: GameDna): string {
  const lines: string[] = [`schemaVersion=${dna.schemaVersion}`];
  const distribution = <K extends string>(
    prefix: string,
    values: Distribution<K>,
  ): void => {
    for (const key of Object.keys(values).sort()) {
      lines.push(`${prefix}.${key}=${values[key as K]}`);
    }
  };

  distribution("role", dna.roles);
  distribution("relation", dna.relationKinds);
  distribution("constraint", dna.constraintKinds);
  lines.push(`count.systems=${dna.systemCount}`);
  lines.push(`count.entities=${dna.entityCount}`);
  lines.push(`declares.progression=${dna.declares.progression}`);
  lines.push(`declares.scoring=${dna.declares.scoring}`);
  return lines.join("\n");
}

/**
 * Content identity of a DNA.
 *
 * Deliberately the ARTIFACT-CONTRACT-2 construction for a string payload —
 * `sha256` over the canonical JSON encoding, which for a string is exactly its
 * JSON form. Computed here rather than imported so the validation layer keeps
 * no dependency on the pipeline layer, the same way `scriptContentHash` does
 * in `luaSecurityReview.ts`; a test pins the two against each other.
 *
 * It covers the DNA alone. If a comparison were folded in, the same structure
 * generated twice would fingerprint differently — which is the one property
 * this whole slice exists to provide.
 */
export function fingerprintGameDna(dna: GameDna): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(encodeGameDna(dna)), "utf8")
    .digest("hex")}`;
}

/** Normalized L1 distance between two counted distributions. */
function distributionDistance<K extends string>(
  left: Distribution<K>,
  right: Distribution<K>,
): number {
  const keys = Object.keys(left) as K[];
  let difference = 0;
  let total = 0;
  for (const key of keys) {
    difference += Math.abs(left[key] - right[key]);
    total += left[key] + right[key];
  }
  return total === 0 ? 0 : difference / total;
}

function scalarDistance(left: number, right: number): number {
  const total = left + right;
  return total === 0 ? 0 : Math.abs(left - right) / total;
}

function booleanDistance(left: boolean, right: boolean): number {
  return left === right ? 0 : 1;
}

/**
 * Structural distance between two generations.
 *
 * Symmetric, and a function of the DNA alone — no clock, no ordering, no
 * identity of which generation came first. Every component is normalized to
 * `0..1` and the result is their unweighted mean: weighting one dimension over
 * another is a judgement about what makes games different, and nothing has
 * measured that yet. `NOVELTY-2` is where a weighted or thresholded reading
 * belongs, once there are fingerprints to calibrate against.
 */
export function compareGameDna(
  left: GameDna,
  right: GameDna,
): GameDnaComparison {
  const components: GameDnaComponentDistance[] = [
    {
      component: "roles",
      distance: distributionDistance(left.roles, right.roles),
    },
    {
      component: "relationKinds",
      distance: distributionDistance(left.relationKinds, right.relationKinds),
    },
    {
      component: "constraintKinds",
      distance: distributionDistance(
        left.constraintKinds,
        right.constraintKinds,
      ),
    },
    {
      component: "systemCount",
      distance: scalarDistance(left.systemCount, right.systemCount),
    },
    {
      component: "entityCount",
      distance: scalarDistance(left.entityCount, right.entityCount),
    },
    {
      component: "declaresProgression",
      distance: booleanDistance(
        left.declares.progression,
        right.declares.progression,
      ),
    },
    {
      component: "declaresScoring",
      distance: booleanDistance(left.declares.scoring, right.declares.scoring),
    },
  ];

  const distance =
    components.reduce((sum, part) => sum + part.distance, 0) /
    components.length;

  return { distance, components };
}

/** A generation this project already produced, as read from durable storage. */
export interface PriorGeneration {
  readonly executionId: string;
  readonly fingerprint: string;
  readonly dna: GameDna;
}

export interface DnaPriorComparison {
  readonly executionId: string;
  readonly fingerprint: string;
  readonly distance: number;
  /** Byte-identical structure, which is a stronger statement than distance 0. */
  readonly identical: boolean;
}

/**
 * How many comparisons the report carries.
 *
 * Every prior generation is compared; only the nearest are written down, so a
 * long-lived project does not accumulate an artifact proportional to its own
 * history. `priorsCompared` always states the real total, so the truncation is
 * visible in the record rather than silently implied by a short list.
 */
export const MAX_RECORDED_COMPARISONS = 10;

export interface GameDnaReport {
  readonly schemaVersion: number;
  readonly dna: GameDna;
  /** Covers `dna` alone — see `fingerprintGameDna`. */
  readonly fingerprint: string;
  readonly outcome: DnaComparisonOutcome;
  /**
   * Prior generations of this project visible in durable storage.
   *
   * Counted from the artifact a DNA could have been derived from — the world
   * model — not from DNA artifacts, so a project generated before this stage
   * existed reports the generations it really has and lands on
   * `prior-without-dna` rather than reading as a project with no history.
   */
  readonly priorsFound: number;
  /** Those that carried a readable DNA, and so could actually be compared. */
  readonly priorsCompared: number;
  /** Nearest first. At most `MAX_RECORDED_COMPARISONS`. */
  readonly comparisons: readonly DnaPriorComparison[];
  readonly nearest?: DnaPriorComparison;
}

/**
 * Build the durable record for one generation.
 *
 * Pure: the caller loads prior generations, because reading them is a storage
 * concern and this module is in the validation layer.
 *
 * The outcome is never inferred from an empty list. A project's first
 * generation is `no-prior-generations`, and one whose predecessors were all
 * written before this stage existed is `prior-without-dna` — neither is
 * novelty, and neither may be read as a pass.
 */
export function buildGameDnaReport(input: {
  readonly dna: GameDna;
  readonly priorsFound: number;
  readonly priors: readonly PriorGeneration[];
}): GameDnaReport {
  const fingerprint = fingerprintGameDna(input.dna);

  const comparisons = input.priors
    .map((prior) => ({
      executionId: prior.executionId,
      fingerprint: prior.fingerprint,
      distance: compareGameDna(input.dna, prior.dna).distance,
      identical: prior.fingerprint === fingerprint,
    }))
    // Ordered by distance, then by execution id compared code unit by code
    // unit. `localeCompare` would order two byte-identical ids differently on
    // hosts with different locales, which SECURITY-REVIEW-A2 had to correct.
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        (left.executionId < right.executionId
          ? -1
          : left.executionId > right.executionId
            ? 1
            : 0),
    );

  const outcome: DnaComparisonOutcome =
    input.priorsFound === 0
      ? "no-prior-generations"
      : comparisons.length === 0
        ? "prior-without-dna"
        : "compared";

  const recorded = comparisons.slice(0, MAX_RECORDED_COMPARISONS);

  return {
    schemaVersion: GAME_DNA_SCHEMA_VERSION,
    dna: input.dna,
    fingerprint,
    outcome,
    priorsFound: input.priorsFound,
    priorsCompared: comparisons.length,
    comparisons: recorded,
    ...(recorded.length > 0 ? { nearest: recorded[0] } : {}),
  };
}
