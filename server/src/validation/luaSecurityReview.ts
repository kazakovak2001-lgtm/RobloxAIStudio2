/**
 * luaSecurityReview — deterministic trust-boundary review of generated Luau.
 *
 * SECREVIEW-1. The platform already refuses Lua that is not *playable*
 * (`server/src/types/playableLua.ts`), but nothing checks whether it is
 * *exploitable*. That gap is structural rather than incidental: the playability
 * contract positively requires a `RemoteEvent` plus `FireClient`/
 * `FireAllClients` on the server and `OnClientEvent` on the client, so every
 * generated game is pushed to open a remote surface, while nothing asks
 * whether the server validates what comes back across it.
 *
 * The rule this encodes is the one the brief states: CLIENT REQUESTS, SERVER
 * DECIDES. A client may ask; only the server may decide what the request is
 * worth.
 *
 * Deterministic by design. These are structural questions with structural
 * answers — does an `OnServerEvent` handler exist, does it use its arguments
 * as authority — so they are answered in code rather than by a model. That
 * follows the project rule to use code where reasoning is not required, and it
 * keeps the review free, instant and reproducible.
 *
 * Honest about its limits. This is pattern analysis over source text, not a
 * Luau parser or a dataflow engine. It is written to avoid crying wolf: every
 * rule below requires positive evidence of a dangerous shape rather than
 * absence of a safe one, because a reviewer that fires on every generation
 * would be ignored and would be worse than none. It will therefore miss
 * exploits it cannot see, and `SecurityReviewReport.limits` records that
 * rather than implying completeness.
 */

/**
 * How a report was produced. Recorded on the artifact so a historical report
 * states its own provenance instead of being read under whatever regime is
 * current when someone opens it.
 */
export const SECURITY_ANALYSIS_MODES = ["deterministic-pattern"] as const;
export type SecurityAnalysisMode = (typeof SECURITY_ANALYSIS_MODES)[number];

/**
 * What a report was allowed to do when it was produced.
 *
 * The vocabulary names `blocking` so a future report can distinguish itself
 * from this one, but nothing in this slice consumes that value and no code
 * path branches on enforcement. Introducing blocking behaviour is
 * SECURITY-REVIEW-B, gated on the criteria in
 * `docs/00-project-control/SECURITY-REVIEW-B_PROMOTION_CRITERIA.md`.
 */
export const SECURITY_ENFORCEMENT_MODES = ["advisory", "blocking"] as const;
export type SecurityEnforcement = (typeof SECURITY_ENFORCEMENT_MODES)[number];

/** The only mode this reviewer emits. Findings never negate delivery. */
export const SECURITY_REVIEW_ANALYSIS_MODE: SecurityAnalysisMode =
  "deterministic-pattern";
export const SECURITY_REVIEW_ENFORCEMENT: SecurityEnforcement = "advisory";

export type SecurityFindingSeverity = "critical" | "high" | "medium";

export interface SecurityFinding {
  /** Stable identifier, safe to match on in tests and dashboards. */
  code: string;
  severity: SecurityFindingSeverity;
  /** Script path the finding was raised against. */
  path: string;
  /** What is wrong, in terms of the trust boundary. */
  message: string;
  /** What a correct implementation does instead. */
  remediation: string;
}

export interface SecurityReviewReport {
  schemaVersion: number;
  /**
   * How this report was produced. Carried on the artifact, not just logged,
   * so the durable record is self-describing.
   */
  analysisMode: SecurityAnalysisMode;
  /**
   * What this report was allowed to do when it was written. Always
   * `"advisory"` here: findings did not and could not negate delivery. A
   * later blocking regime must not be read backwards onto these records.
   */
  enforcement: SecurityEnforcement;
  reviewedScriptCount: number;
  findings: SecurityFinding[];
  /** True when no finding was raised. Not a claim that the game is secure. */
  clean: boolean;
  /** Stated so no consumer can read this report as an exhaustive audit. */
  limits: string[];
}

export const SECURITY_REVIEW_SCHEMA_VERSION = 1;

const REVIEW_LIMITS: readonly string[] = [
  "Pattern analysis over source text, not a Luau parser or dataflow analysis.",
  "Rules require positive evidence of a dangerous shape, so absence of findings is not proof of safety.",
  "Only server and client scripts delivered in this artifact are reviewed; runtime behaviour is not executed.",
];

interface ReviewableScript {
  path: string;
  content: string;
}

/** Server scripts decide; client scripts request. */
function isServerScript(path: string): boolean {
  return path.startsWith("ServerScriptService/");
}

function isClientScript(path: string): boolean {
  return (
    path.startsWith("StarterPlayerScripts/") ||
    path.startsWith("StarterCharacterScripts/")
  );
}

/**
 * Remove comments and string literals before matching.
 *
 * Without this, a comment saying "never trust the client amount" reads as
 * code, and a string containing "SetAsync" reads as a DataStore write. The
 * playability contract strips the same way for the same reason.
 */
function executableSource(source: string): string {
  let result = "";
  let index = 0;
  let quote: '"' | "'" | null = null;

  while (index < source.length) {
    const char = source[index];

    if (quote) {
      if (char === "\\" && index + 1 < source.length) {
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      result += " ";
      index++;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      result += " ";
      index++;
      continue;
    }

    if (char === "-" && source[index + 1] === "-") {
      if (source.slice(index + 2, index + 4) === "[[") {
        const end = source.indexOf("]]", index + 4);
        index = end === -1 ? source.length : end + 2;
      } else {
        const end = source.indexOf("\n", index + 2);
        index = end === -1 ? source.length : end + 1;
        result += "\n";
      }
      continue;
    }

    if (source.slice(index, index + 2) === "[[") {
      const end = source.indexOf("]]", index + 2);
      result += " ";
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    result += char;
    index++;
  }

  return result;
}

/**
 * Extract the body of each `OnServerEvent:Connect(function(player, ...))`
 * handler, together with the parameter names after `player`.
 *
 * Those parameters are the client's claim. Everything this module says about
 * trust is a statement about how they are used.
 */
interface RemoteHandler {
  /** Parameter names the client controls, excluding the player argument. */
  clientParams: string[];
  body: string;
}

function extractRemoteHandlers(source: string): RemoteHandler[] {
  const handlers: RemoteHandler[] = [];
  const pattern = /OnServerEvent\s*:\s*Connect\s*\(\s*function\s*\(([^)]*)\)/g;

  for (const match of source.matchAll(pattern)) {
    const params = match[1]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    // The first parameter is the player Roblox supplies, which is trustworthy.
    const clientParams = params.slice(1);

    const bodyStart = match.index! + match[0].length;
    handlers.push({
      clientParams,
      body: matchFunctionBody(source, bodyStart),
    });
  }

  return handlers;
}

/** Read forward to the `end` that closes the handler, tracking nesting. */
function matchFunctionBody(source: string, start: number): string {
  const opener = /\b(function|if|for|while|do)\b/g;
  const closer = /\bend\b/g;
  let depth = 1;
  let index = start;

  while (index < source.length && depth > 0) {
    opener.lastIndex = index;
    closer.lastIndex = index;
    const nextOpen = opener.exec(source);
    const nextClose = closer.exec(source);

    if (!nextClose) return source.slice(start);
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      index = nextOpen.index + nextOpen[0].length;
      continue;
    }

    depth--;
    index = nextClose.index + nextClose[0].length;
  }

  return source.slice(start, index);
}

/** Does the handler subject this client value to any server-side test? */
function validatesParameter(body: string, param: string): boolean {
  const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const guards = [
    // A comparison, range check or membership test against the value.
    new RegExp(`\\b${escaped}\\b\\s*(==|~=|<=|>=|<|>)`),
    new RegExp(`(==|~=|<=|>=|<|>)\\s*\\b${escaped}\\b`),
    // A type or shape assertion.
    new RegExp(`type\\s*\\(\\s*${escaped}\\s*\\)`),
    new RegExp(`typeof\\s*\\(\\s*${escaped}\\s*\\)`),
    new RegExp(`tonumber\\s*\\(\\s*${escaped}\\s*\\)`),
    // Clamping or bounding.
    new RegExp(`math\\.(clamp|min|max|floor|abs)\\s*\\([^)]*\\b${escaped}\\b`),
    // Explicit rejection.
    new RegExp(`if\\s+not\\s+${escaped}\\b`),
    // Membership in a server-owned table.
    new RegExp(`\\[\\s*${escaped}\\s*\\]`),
  ];

  return guards.some((guard) => guard.test(body));
}

const RULES: Array<{
  code: string;
  severity: SecurityFindingSeverity;
  message: string;
  remediation: string;
  /** Dangerous shapes, matched against the handler body. */
  pattern: RegExp;
}> = [
  {
    code: "REMOTE_CLIENT_VALUE_AWARDED",
    severity: "critical",
    message:
      "A server RemoteEvent handler adds a client-supplied value to a reward, currency or score",
    remediation:
      "Decide the amount on the server. Treat the client argument as a request identifier, never as the value.",
    pattern:
      /\b(leaderstats|[A-Za-z_]*(?:Cash|Coins|Gold|Money|Score|Points|Gems|Credits|Xp|Exp)[A-Za-z_]*)\b[^\n]*\.Value\s*(\+=|=)/i,
  },
  {
    code: "REMOTE_CLIENT_DAMAGE",
    severity: "critical",
    message:
      "A server RemoteEvent handler applies client-supplied damage or health change",
    remediation:
      "Compute damage on the server from server-owned state. Never accept an amount from the client.",
    pattern: /:TakeDamage\s*\(|\bHealth\s*(-=|\+=|=)/i,
  },
  {
    code: "REMOTE_CLIENT_TELEPORT",
    severity: "high",
    message:
      "A server RemoteEvent handler moves a character to a client-supplied position",
    remediation:
      "Accept a destination identifier and resolve the position from a server-owned table.",
    pattern: /(CFrame|Position)\s*=|:PivotTo\s*\(|:MoveTo\s*\(/,
  },
  {
    code: "REMOTE_CLIENT_INSTANCE_MUTATION",
    severity: "high",
    message:
      "A server RemoteEvent handler destroys or reparents an instance chosen by the client",
    remediation:
      "Resolve the instance from server state and verify the player is allowed to affect it.",
    pattern: /:Destroy\s*\(\s*\)|\.Parent\s*=/,
  },
  {
    code: "REMOTE_CLIENT_PERSISTED",
    severity: "critical",
    message:
      "A server RemoteEvent handler writes a client-supplied value to a DataStore",
    remediation:
      "Persist only server-computed state, after validating the request.",
    pattern: /:SetAsync\s*\(|:UpdateAsync\s*\(|:IncrementAsync\s*\(/,
  },
];

/**
 * Review generated Lua for trust-boundary defects.
 *
 * Never throws: a review that can fail closed would block delivery on its own
 * bugs, and this slice is deliberately advisory.
 */
export function reviewLuaSecurity(
  scripts: readonly ReviewableScript[],
): SecurityReviewReport {
  const findings: SecurityFinding[] = [];
  const reviewed = scripts.filter(
    (script) => isServerScript(script.path) || isClientScript(script.path),
  );

  for (const script of reviewed) {
    const source = executableSource(script.content);

    if (isServerScript(script.path)) {
      for (const handler of extractRemoteHandlers(source)) {
        const unvalidated = handler.clientParams.filter(
          (param) => !validatesParameter(handler.body, param),
        );
        // With no unchecked client argument there is no client authority to
        // misuse, so the rules below cannot apply.
        if (unvalidated.length === 0) continue;

        for (const rule of RULES) {
          if (rule.pattern.test(handler.body)) {
            findings.push({
              code: rule.code,
              severity: rule.severity,
              path: script.path,
              message: `${rule.message}. Unvalidated client argument(s): ${unvalidated.join(", ")}.`,
              remediation: rule.remediation,
            });
          }
        }
      }
    }

    if (isClientScript(script.path)) {
      if (/:SetAsync\s*\(|:UpdateAsync\s*\(|GetDataStore\s*\(/.test(source)) {
        findings.push({
          code: "CLIENT_DATASTORE_ACCESS",
          severity: "critical",
          path: script.path,
          message:
            "A client script reaches for DataStore APIs, which do not exist on the client and signal server logic placed on the client",
          remediation: "Move persistence to a server Script.",
        });
      }
      if (/\bServerStorage\b|\bServerScriptService\b/.test(source)) {
        findings.push({
          code: "CLIENT_SERVER_CONTAINER_ACCESS",
          severity: "high",
          path: script.path,
          message:
            "A client script references a server-only container, which is not replicated and indicates a misplaced trust boundary",
          remediation:
            "Keep server-only assets on the server and expose what the client needs through ReplicatedStorage.",
        });
      }
    }
  }

  return {
    schemaVersion: SECURITY_REVIEW_SCHEMA_VERSION,
    // Constants, not computed from the findings. Enforcement is a property of
    // the regime that produced the report, never of what it happened to find,
    // so a report with findings is no more blocking than a clean one.
    analysisMode: SECURITY_REVIEW_ANALYSIS_MODE,
    enforcement: SECURITY_REVIEW_ENFORCEMENT,
    reviewedScriptCount: reviewed.length,
    findings,
    clean: findings.length === 0,
    limits: [...REVIEW_LIMITS],
  };
}
