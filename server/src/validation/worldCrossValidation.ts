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

import {
  stripLuaComments,
  stripLuaStrings,
  type PlayableLuaScript,
} from "../types/playableLua";
import type { WorldRuntimeMode } from "../types/worldRuntimeMode";
import type { WorldModel, WorldRole } from "./worldModel";

export const WORLD_CROSS_VALIDATION_SCHEMA_VERSION = 1;

/**
 * How the comparison was made. Recorded on the evidence so a later, stronger
 * method cannot be read backwards onto findings produced by this one.
 *
 * WORLD-1C. `deterministic-pattern` asks whether the Lua *constructs* what a
 * role requires. `deterministic-binding-pattern` asks whether it *references
 * and interacts with* an already-materialized entity instead — a different
 * evidence class, per `docs/00-project-control/WORLD-1C_SCOPE.md` ("Cross-
 * artifact validation"). Recorded on every result so a `materialized-world`
 * finding is never read as if it had been proven the `lua-owned` way, or vice
 * versa.
 */
export const WORLD_CROSS_ANALYSIS_MODES = [
  "deterministic-pattern",
  "deterministic-binding-pattern",
] as const;
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

interface RoleEvidenceEntry {
  expectation: string;
  /** Undefined means no source-text evidence can settle this role. */
  matches?: (source: WorldSources) => boolean;
}

type RoleEvidenceMap = Readonly<Record<WorldRole, RoleEvidenceEntry>>;

/**
 * What each role requires the generated code to contain when Lua owns and
 * builds the world. Unchanged by WORLD-1C — see
 * `docs/00-project-control/WORLD-1C_SCOPE.md`.
 *
 * Roles without an entry are unverifiable by construction, which is why the
 * map is exhaustive over `WorldRole`: adding a role forces a decision about
 * what would prove it, rather than letting it default to a pass.
 */
const LUA_OWNED_ROLE_EVIDENCE: RoleEvidenceMap = {
  "player-entry": {
    expectation: "server code places players into the world",
    matches: (source) =>
      /Instance\.new\s*\(\s*["']SpawnLocation["']/.test(source.server) ||
      /\bRespawnLocation\b/.test(source.server) ||
      /\b(?:LoadCharacter|MoveTo)\b/.test(source.server) ||
      // The boundary belongs to the identifier, not after the `=`. Trailing it
      // on the whole alternation required a word character to follow the sign,
      // so `part.CFrame = CFrame.new(...)` — the idiomatic form — never matched
      // and a real placement was reported unsupported.
      /\bCFrame\s*=/.test(source.server),
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
    // Both routes the playability contract already accepts. Recognising only
    // remotes would report every progress claim unsupported for a leaderstats
    // package the platform itself considers valid, and a check that cries wolf
    // on accepted output is one nobody will keep believing.
    matches: (source) =>
      (/\b(?:FireClient|FireAllClients|FireServer)\s*\(/.test(source.server) ||
        (/\bleaderstats\b/i.test(source.server) &&
          /Instance\.new\s*\(\s*["']IntValue["']/.test(source.server))) &&
      (/\bOnClientEvent\s*:\s*Connect\s*\(/.test(source.client) ||
        (/\bleaderstats\b/i.test(source.client) &&
          /\.Changed\s*:\s*Connect\s*\(/.test(source.client))),
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

/**
 * What each role requires when the world is materialized and Lua only binds
 * to it. Per `docs/00-project-control/WORLD-1C_SCOPE.md` ("Cross-artifact
 * validation"): the question changes from whether Lua *constructs* what the
 * role requires to whether it *references and interacts with* it. A string
 * appearing in source is not proof of a binding, so evidence still requires a
 * real lookup call (`WaitForChild`/`FindFirstChild`) — never presence of the
 * claim's id or title alone.
 *
 * `player-entry` is the only role whose evidence changes. It is the one
 * claim in this map that corresponds to the "world instances" rule
 * `getPlayableLuaIssues` also replaces under this mode (the scope doc's
 * "The playability contract" table). Every other role keeps exactly the
 * `LUA_OWNED_ROLE_EVIDENCE` entry it already has, for the same reason the
 * scope doc gives for the HUD and gameplay-interaction playability rules:
 * `interactive-entity` (a `Connect` call) and `presentation` (a client
 * surface) are not claims about who owns world *structure*, `progress-signal`
 * and `persistence` cross the server/client boundary or reach a durable store
 * regardless of who built the world, and `server-authority`/`descriptive`
 * have no source-text evidence under either mode. Reusing the same object
 * reference (not a re-declared duplicate) keeps that unchanged-ness provable
 * by identity rather than by two copies staying in sync by hand.
 */
const MATERIALIZED_WORLD_ROLE_EVIDENCE: RoleEvidenceMap = {
  "player-entry": {
    expectation:
      "server code binds to a materialized entry point and pivots the player there",
    // `:PivotTo(` deliberately does not appear in `LUA_OWNED_ROLE_EVIDENCE`'s
    // `player-entry` evidence (`LoadCharacter`/`MoveTo`/`CFrame=`), so a
    // fixture built to satisfy only this evidence is never accidentally
    // reported `supported` under `lua-owned` too — the two claims are
    // evidence of different things, not the same thing spelled differently.
    matches: (source) =>
      /\b(?:WaitForChild|FindFirstChild)\s*\(/.test(source.server) &&
      /:PivotTo\s*\(/.test(source.server),
  },
  "interactive-entity": LUA_OWNED_ROLE_EVIDENCE["interactive-entity"],
  "progress-signal": LUA_OWNED_ROLE_EVIDENCE["progress-signal"],
  presentation: LUA_OWNED_ROLE_EVIDENCE.presentation,
  persistence: LUA_OWNED_ROLE_EVIDENCE.persistence,
  "server-authority": LUA_OWNED_ROLE_EVIDENCE["server-authority"],
  descriptive: LUA_OWNED_ROLE_EVIDENCE.descriptive,
};

interface WorldSources {
  readonly server: string;
  readonly client: string;
  readonly all: string;
}

/**
 * String literals that are part of the construct being looked for rather than
 * incidental text, so they survive normalization.
 *
 * Everything else inside comments and strings is removed before matching. A
 * comment describing a DataStore integration that was never written would
 * otherwise be read as evidence that it was — which is the direction of error
 * that matters here, since it turns an unmet claim into a supported one.
 */
const PRESERVED_LITERALS: ReadonlySet<string> = new Set([
  "SpawnLocation",
  "ClickDetector",
  "ProximityPrompt",
  "ScreenGui",
  "IntValue",
  "leaderstats",
]);

/**
 * Compare a world model's claims against the Lua that was generated with it.
 *
 * Deliberately never throws for an unmatched claim: unmatched claims are
 * findings, and a finding is not a verdict on the game. `mode` is the one
 * exception — an unrecognized world runtime mode fails closed rather than
 * silently choosing an evidence class, per WORLD-1C's tenant/ownership
 * invariants. `mode` defaults to `lua-owned` so every existing caller, which
 * passes no third argument, is byte-for-byte unaffected.
 */
export function crossValidateWorld(
  world: WorldModel,
  scripts: readonly PlayableLuaScript[],
  mode: WorldRuntimeMode = "lua-owned",
): WorldCrossValidation {
  if (mode !== "lua-owned" && mode !== "materialized-world") {
    throw new Error(`Unknown world runtime mode: ${String(mode)}`);
  }
  const materialized = mode === "materialized-world";
  const roleEvidence = materialized
    ? MATERIALIZED_WORLD_ROLE_EVIDENCE
    : LUA_OWNED_ROLE_EVIDENCE;
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
    const evidence = roleEvidence[claim.role];
    const status: WorldClaimStatus = !evidence.matches
      ? "unverifiable"
      : evidence.matches(sources)
        ? "supported"
        : "unsupported";
    return { ...claim, status, expectation: evidence.expectation };
  });

  return {
    schemaVersion: WORLD_CROSS_VALIDATION_SCHEMA_VERSION,
    analysisMode: materialized
      ? "deterministic-binding-pattern"
      : WORLD_CROSS_ANALYSIS_MODE,
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
  const executable = (script: PlayableLuaScript): string =>
    stripLuaStrings(stripLuaComments(script.content), PRESERVED_LITERALS);

  const server = scripts
    .filter((script) => script.path.startsWith("ServerScriptService/"))
    .map(executable)
    .join("\n");
  const client = scripts
    .filter((script) => script.path.startsWith("StarterPlayerScripts/"))
    .map(executable)
    .join("\n");

  return {
    server,
    client,
    all: scripts.map(executable).join("\n"),
  };
}
