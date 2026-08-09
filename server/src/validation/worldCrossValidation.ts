/**
 * worldCrossValidation.ts
 *
 * WORLD-1A. Does the generated Lua do what the world model claims?
 *
 * Every stage of this pipeline has been checked against itself: the Lua is
 * playable, the review is clean, the plan is valid. Nothing has ever compared
 * two artifacts to each other, so a generation could claim a persistence
 * system and ship code that never touches a DataStore, and every gate would
 * stay green. This is the first check that can catch that.
 *
 * Evidence, not judgement. A role is confirmed only by a pattern that must be
 * present for the claim to be true at all, and a role with no such pattern is
 * reported `unverifiable` rather than passed. Claiming to have checked
 * something is the failure mode this whole slice exists to avoid.
 *
 * Pure module: no I/O, no clock, no model calls.
 */

import type { PlayableLuaScript } from "../types/playableLua";
import type { WorldModel, WorldRole } from "./worldModel";

export const WORLD_CROSS_VALIDATION_SCHEMA_VERSION = 1;

/**
 * How the comparison was made. Recorded on the evidence so a later, stronger
 * method cannot be read backwards onto findings produced by this one.
 */
export const WORLD_CROSS_ANALYSIS_MODES = ["deterministic-pattern"] as const;
export type WorldCrossAnalysisMode =
  (typeof WORLD_CROSS_ANALYSIS_MODES)[number];

export const WORLD_CROSS_ANALYSIS_MODE: WorldCrossAnalysisMode =
  "deterministic-pattern";

export type WorldClaimStatus =
  /** The Lua contains evidence the claim requires. */
  | "supported"
  /** The claim requires evidence the Lua does not contain. */
  | "unsupported"
  /** Nothing in source text could confirm or deny this claim. */
  | "unverifiable";

export interface WorldClaimResult {
  /** Identifier of the claimed system or entity. */
  readonly claimId: string;
  readonly role: WorldRole;
  readonly title: string;
  readonly status: WorldClaimStatus;
  /** What was looked for, in plain terms. Never model output. */
  readonly expectation: string;
}

export interface WorldCrossValidation {
  readonly schemaVersion: number;
  readonly analysisMode: WorldCrossAnalysisMode;
  readonly claims: readonly WorldClaimResult[];
  readonly supported: number;
  readonly unsupported: number;
  readonly unverifiable: number;
  readonly limits: readonly string[];
}

const LIMITS: readonly string[] = [
  "Pattern analysis over Lua source text: not a Luau parser, and no code is executed.",
  "A supported claim means the code contains what the claim requires, not that it behaves correctly.",
  "An unverifiable claim is neither confirmed nor denied — no evidence in source text could settle it.",
  "Absence of unsupported claims is not evidence that the world matches the design.",
];

/**
 * What each role requires the generated code to contain.
 *
 * Roles without an entry are unverifiable by construction, which is why the
 * map is exhaustive over `WorldRole`: adding a role forces a decision about
 * what would prove it, rather than letting it default to a pass.
 */
const ROLE_EVIDENCE: Readonly<
  Record<
    WorldRole,
    {
      expectation: string;
      /** Undefined means no source-text evidence can settle this role. */
      matches?: (source: WorldSources) => boolean;
    }
  >
> = {
  "player-entry": {
    expectation: "server code places players into the world",
    matches: (source) =>
      /Instance\.new\s*\(\s*["']SpawnLocation["']/.test(source.server) ||
      /\bRespawnLocation\b/.test(source.server) ||
      /\b(?:LoadCharacter|MoveTo|CFrame\s*=)\b/.test(source.server),
  },
  "interactive-entity": {
    expectation: "server code connects a player-driven interaction",
    matches: (source) =>
      /\b(?:Touched|Activated|Triggered|MouseClick|MouseButton1Click)\s*:\s*Connect\s*\(/.test(
        source.server,
      ) ||
      /Instance\.new\s*\(\s*["'](?:ClickDetector|ProximityPrompt)["']/.test(
        source.server,
      ),
  },
  "progress-signal": {
    expectation:
      "state crosses the server/client boundary and the client observes it",
    matches: (source) =>
      /\b(?:FireClient|FireAllClients|FireServer)\s*\(/.test(source.server) &&
      /\bOnClientEvent\s*:\s*Connect\s*\(/.test(source.client),
  },
  presentation: {
    expectation: "client code builds something the player can see",
    matches: (source) =>
      /Instance\.new\s*\(\s*["']ScreenGui["']/.test(source.client),
  },
  persistence: {
    expectation: "code reaches a store that outlives the session",
    matches: (source) =>
      /\bDataStoreService\b/.test(source.all) ||
      /\b(?:GetAsync|SetAsync|UpdateAsync|IncrementAsync)\s*\(/.test(
        source.all,
      ),
  },
  "server-authority": {
    // A rule can be owned by the server in ways no pattern distinguishes from
    // ordinary server code. Claiming to have verified it would be the exact
    // false assurance this module exists to avoid.
    expectation: "no source-text evidence can establish ownership of a rule",
  },
  descriptive: {
    expectation: "the claim describes intent rather than runtime behaviour",
  },
};

interface WorldSources {
  readonly server: string;
  readonly client: string;
  readonly all: string;
}

/**
 * Compare a world model's claims against the Lua that was generated with it.
 *
 * Deliberately never throws and never blocks: unmatched claims are findings,
 * and a finding is not a verdict on the game.
 */
export function crossValidateWorld(
  world: WorldModel,
  scripts: readonly PlayableLuaScript[],
): WorldCrossValidation {
  const sources = collectSources(scripts);

  const claims: WorldClaimResult[] = [
    ...world.systems.map((system) => ({
      claimId: system.id,
      role: system.role,
      title: system.title,
    })),
    ...world.entities.map((entity) => ({
      claimId: entity.id,
      role: entity.role,
      title: entity.title,
    })),
  ].map((claim) => {
    const evidence = ROLE_EVIDENCE[claim.role];
    const status: WorldClaimStatus = !evidence.matches
      ? "unverifiable"
      : evidence.matches(sources)
        ? "supported"
        : "unsupported";
    return { ...claim, status, expectation: evidence.expectation };
  });

  return {
    schemaVersion: WORLD_CROSS_VALIDATION_SCHEMA_VERSION,
    analysisMode: WORLD_CROSS_ANALYSIS_MODE,
    claims,
    supported: claims.filter((claim) => claim.status === "supported").length,
    unsupported: claims.filter((claim) => claim.status === "unsupported")
      .length,
    unverifiable: claims.filter((claim) => claim.status === "unverifiable")
      .length,
    limits: LIMITS,
  };
}

/**
 * Split the package by trust side.
 *
 * A claim about what the client observes must not be satisfied by server
 * source and vice versa — that is the whole reason the two are kept apart.
 */
function collectSources(scripts: readonly PlayableLuaScript[]): WorldSources {
  const server = scripts
    .filter((script) => script.path.startsWith("ServerScriptService/"))
    .map((script) => script.content)
    .join("\n");
  const client = scripts
    .filter((script) => script.path.startsWith("StarterPlayerScripts/"))
    .map((script) => script.content)
    .join("\n");

  return {
    server,
    client,
    all: scripts.map((script) => script.content).join("\n"),
  };
}
