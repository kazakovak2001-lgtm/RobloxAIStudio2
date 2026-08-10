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
 * SECURITY-REVIEW-A2 hardened this without changing its advisory role. The
 * report now says which exact script bytes it read, distinguishes analysed
 * from unanalysable input so a report over nothing can no longer read as a
 * pass, and carries a source location and the matched evidence on every
 * finding.
 *
 * Honest about its limits. This is pattern analysis over source text, not a
 * Luau parser or a dataflow engine. It is written to avoid crying wolf: every
 * rule below requires positive evidence of a dangerous shape rather than
 * absence of a safe one, because a reviewer that fires on every generation
 * would be ignored and would be worse than none. It will therefore miss
 * exploits it cannot see, and `SecurityReviewReport.limits` records that
 * rather than implying completeness.
 */

import { createHash } from "crypto";

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

/**
 * What the reviewer concluded, per script and for the report as a whole.
 *
 * The three non-`finding` values exist so silence can be told apart from
 * safety. `pass` is the only one that means "analysed and nothing found";
 * `not_applicable` means no rule could apply where this script lives; and
 * `not_inspected` means the reviewer could not read it at all.
 */
export const SECURITY_REVIEW_OUTCOMES = [
  "pass",
  "finding",
  "not_applicable",
  "not_inspected",
] as const;
export type SecurityReviewOutcome = (typeof SECURITY_REVIEW_OUTCOMES)[number];

export interface SecurityFinding {
  /** Stable identifier, safe to match on in tests and dashboards. */
  code: string;
  severity: SecurityFindingSeverity;
  /** Script path the finding was raised against. */
  path: string;
  /**
   * 1-based line in the reviewed script, or `null` when the shape the rule
   * matched has no single line to point at.
   */
  line: number | null;
  /** What is wrong, in terms of the trust boundary. */
  message: string;
  /**
   * The source the rule actually matched, comment- and string-stripped and
   * collapsed to one line. Evidence for the claim, so a reader can judge the
   * finding instead of taking it on trust.
   */
  evidence: string;
  /** What a correct implementation does instead. */
  remediation: string;
}

/**
 * One supplied script and what the reviewer did with it.
 *
 * `contentHash` is the ARTIFACT-CONTRACT-2 content identity of the exact bytes
 * reviewed, so a later reader can tell whether this report still describes the
 * Lua that is there now.
 */
export interface ReviewedScript {
  path: string;
  contentHash: string | null;
  outcome: SecurityReviewOutcome;
  /** Why, whenever the outcome is not `pass` or `finding`. */
  reason?: string;
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
  /**
   * What this review concluded overall.
   *
   * `pass` requires that something was actually analysed and that nothing was
   * left unread. A review over zero scripts, or one that could not read part
   * of its input, reports `not_inspected` or `not_applicable` — never `pass`.
   */
  outcome: SecurityReviewOutcome;
  /** Scripts the rules were actually run against. */
  reviewedScriptCount: number;
  /** Scripts handed to the reviewer, analysable or not. */
  suppliedScriptCount: number;
  /** Every supplied script, its reviewed bytes, and what became of it. */
  scripts: ReviewedScript[];
  findings: SecurityFinding[];
  /**
   * True only when `outcome` is `pass`. Still not a claim that the game is
   * secure — it is a claim that everything supplied was analysed and no rule
   * fired. Before SECURITY-REVIEW-A2 this was `findings.length === 0`, which
   * meant a review over nothing at all reported clean.
   */
  clean: boolean;
  /** Stated so no consumer can read this report as an exhaustive audit. */
  limits: string[];
}

/**
 * 2 — SECURITY-REVIEW-A2 added `outcome`, per-script provenance, and line and
 * evidence on every finding. Version 1 reports remain readable and must not be
 * reinterpreted under these semantics: their `clean` did not mean this.
 */
export const SECURITY_REVIEW_SCHEMA_VERSION = 2;

const REVIEW_LIMITS: readonly string[] = [
  "Pattern analysis over source text, not a Luau parser or dataflow analysis.",
  "Rules require positive evidence of a dangerous shape, so absence of findings is not proof of safety.",
  "Only server and client scripts delivered in this artifact are reviewed; runtime behaviour is not executed.",
  "A client value is followed through at most one direct assignment, so an exploit routed through a helper or a table is not tracked.",
  "Only server and client script locations carry rules; scripts elsewhere are reported as not_applicable rather than analysed.",
  "A pass means every supplied script was analysed and no rule fired. It is not a claim that the game is secure.",
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
 * Blank out comments and string literals before matching.
 *
 * Without this, a comment saying "never trust the client amount" reads as
 * code, and a string containing "SetAsync" reads as a DataStore write. The
 * playability contract strips the same way for the same reason.
 *
 * Length- and line-preserving: every masked character becomes a space and
 * every newline survives, including newlines inside a block comment or a long
 * string. SECURITY-REVIEW-A2 needs that so an offset in the masked text is the
 * same offset in the original and a finding can name a real line. The previous
 * version collapsed a whole long string to one space, so positions after it
 * referred to nothing.
 */
function executableSource(source: string): string {
  const out = new Array<string>(source.length);
  let index = 0;
  let quote: '"' | "'" | null = null;

  /** Blank `count` characters from `index`, keeping newlines. */
  const mask = (count: number): void => {
    for (let offset = 0; offset < count && index + offset < source.length;) {
      const char = source[index + offset];
      out[index + offset] = char === "\n" ? "\n" : " ";
      offset++;
    }
    index += count;
  };

  while (index < source.length) {
    const char = source[index];

    if (quote) {
      // An escape masks both characters, so a `\"` cannot end the literal.
      if (char === "\\" && index + 1 < source.length) {
        mask(2);
        continue;
      }
      if (char === quote) quote = null;
      mask(1);
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      mask(1);
      continue;
    }

    if (char === "-" && source[index + 1] === "-") {
      if (source.slice(index + 2, index + 4) === "[[") {
        const end = source.indexOf("]]", index + 4);
        mask((end === -1 ? source.length : end + 2) - index);
      } else {
        const end = source.indexOf("\n", index + 2);
        mask((end === -1 ? source.length : end) - index);
      }
      continue;
    }

    if (source.slice(index, index + 2) === "[[") {
      const end = source.indexOf("]]", index + 2);
      mask((end === -1 ? source.length : end + 2) - index);
      continue;
    }

    out[index] = char;
    index++;
  }

  return out.join("");
}

/** 1-based line of an offset in the original source. */
function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === "\n") line++;
  }
  return line;
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
  /** Offset of the body in the masked source, so findings can name a line. */
  bodyStart: number;
}

/**
 * Both server-side remote entry points.
 *
 * `OnServerInvoke` was missed entirely before SECURITY-REVIEW-A2, so every
 * rule below was blind to RemoteFunctions — the same trust boundary, reached
 * through a different assignment. A RemoteFunction is arguably worse, because
 * it also hands the client whatever the handler returns.
 */
const REMOTE_HANDLER_PATTERNS: readonly RegExp[] = [
  /OnServerEvent\s*:\s*Connect\s*\(\s*function\s*\(([^)]*)\)/g,
  /OnServerInvoke\s*=\s*function\s*\(([^)]*)\)/g,
];

function extractRemoteHandlers(source: string): RemoteHandler[] {
  const handlers: RemoteHandler[] = [];

  for (const pattern of REMOTE_HANDLER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const params = match[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      // The first parameter is the player Roblox supplies, which is
      // trustworthy. Everything after it is the client's claim.
      const clientParams = params.slice(1);

      const bodyStart = match.index! + match[0].length;
      handlers.push({
        clientParams,
        body: matchFunctionBody(source, bodyStart),
        bodyStart,
      });
    }
  }

  // Handlers are collected pattern by pattern, so order by position to keep
  // output independent of which remote kind was scanned first.
  return handlers.sort((left, right) => left.bodyStart - right.bodyStart);
}

/**
 * Read forward to the `end` that closes the handler, tracking nesting.
 *
 * `for` and `while` are deliberately absent from the opener set: in Luau they
 * open their block with the `do` that ends the header, so counting the loop
 * keyword as well would add a level no `end` closes. The body would then run
 * past the handler and attribute unrelated code to its client arguments.
 * `repeat` is absent for the opposite reason — it closes with `until`.
 */
function matchFunctionBody(source: string, start: number): string {
  const opener = /\b(function|if|do)\b/g;
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

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The unchecked parameters, plus locals assigned directly from one.
 *
 * A single alias hop covers the common `local amount = rawAmount` shape
 * without becoming dataflow analysis. Anything further — a value passed
 * through a helper, stored in a table and read back — is not tracked, and
 * `limits` says so.
 */
function taintedNames(body: string, unvalidated: string[]): string[] {
  const names = [...unvalidated];

  for (const source of unvalidated) {
    const alias = new RegExp(
      `(?:local\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${escapeName(source)}\\s*(?:$|[\\n;])`,
      "gm",
    );
    for (const match of body.matchAll(alias)) {
      if (!names.includes(match[1])) names.push(match[1]);
    }
  }

  return names;
}

/** Does the handler subject this client value to any server-side test? */
function validatesParameter(body: string, param: string): boolean {
  const escaped = escapeName(param);
  const guards = [
    // A comparison, range check or membership test against the value.
    new RegExp(`\\b${escaped}\\b\\s*(==|~=|<=|>=|<|>)`),
    new RegExp(`(==|~=|<=|>=|<|>)\\s*\\b${escaped}\\b`),
    // A type or shape assertion.
    new RegExp(`type\\s*\\(\\s*${escaped}\\s*\\)`),
    new RegExp(`typeof\\s*\\(\\s*${escaped}\\s*\\)`),
    new RegExp(`tonumber\\s*\\(\\s*${escaped}\\s*\\)`),
    // Bounding, but only where an upper bound is actually imposed.
    // `math.floor` and `math.abs` reshape a value without limiting it, and
    // `math.max` only raises a floor, so none of them stops a client asking
    // for an arbitrarily large reward. Treating them as validation would let
    // `amount = math.floor(amount)` launder an exploit into a clean report.
    new RegExp(`math\\.(clamp|min)\\s*\\([^)]*\\b${escaped}\\b`),
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
  {
    code: "REMOTE_CLIENT_HTTP_TARGET",
    severity: "high",
    message:
      "A server handler sends an outbound HTTP request built from a client-supplied value",
    remediation:
      "Build the request from server-owned configuration. Never let the client choose the destination or the body.",
    // `GetAsync` is deliberately absent: DataStore uses the same name, and a
    // read is already covered where it matters. Posting somewhere the client
    // chose is the shape worth naming.
    pattern: /:PostAsync\s*\(|:RequestAsync\s*\(/,
  },
];

/**
 * Rules evaluated against every client parameter, not only the unvalidated
 * ones.
 *
 * The general guard treats `table[param]` as validation, which is right for a
 * reward table — the client picks a row the server owns. It is wrong for a
 * player registry, where the same shape means the caller chose *whose*
 * account to act on. These rules therefore ignore the validation guard.
 */
const IDENTITY_RULES: Array<{
  code: string;
  severity: SecurityFindingSeverity;
  message: string;
  remediation: string;
  pattern: RegExp;
}> = [
  {
    code: "REMOTE_CLIENT_IDENTITY_TRUSTED",
    severity: "high",
    message:
      "A server handler resolves which player to act on from a client-supplied value instead of the authenticated sender",
    remediation:
      "Act on the `player` argument Roblox supplies. A client naming another player is a request about someone else's account.",
    pattern:
      /\bPlayers\s*\[|:GetPlayerByUserId\s*\(|\bPlayers\s*:\s*FindFirstChild\s*\(/,
  },
];

/**
 * Shapes dangerous wherever they appear in a server script, with no client
 * value required.
 *
 * These are not trust-boundary questions — they are capabilities a generated
 * game has no legitimate use for, and their presence is itself the finding.
 */
const SERVER_SCRIPT_RULES: Array<{
  code: string;
  severity: SecurityFindingSeverity;
  message: string;
  remediation: string;
  pattern: RegExp;
}> = [
  {
    code: "SERVER_DYNAMIC_CODE_EXECUTION",
    severity: "critical",
    message:
      "A server script compiles or rebinds code at runtime, so any string that reaches it becomes executable server code",
    remediation:
      "Remove the dynamic execution. Express the behaviour as ordinary Luau the reviewer and the reader can both see.",
    pattern: /\bloadstring\s*\(|\bgetfenv\s*\(|\bsetfenv\s*\(/,
  },
];

/** One statement of masked source, with the offset it starts at. */
interface Statement {
  text: string;
  offset: number;
}

/**
 * Split a region into statements, keeping each one's absolute offset.
 *
 * Newlines and `;` both end a statement, matching the granularity the rules
 * were written against: a rule and the client value it needs must appear in
 * the same statement, or the rule would fire on a dangerous line that has
 * nothing to do with the client.
 */
function statementsOf(body: string, bodyStart: number): Statement[] {
  const statements: Statement[] = [];
  let start = 0;

  for (let index = 0; index <= body.length; index++) {
    const char = body[index];
    if (index === body.length || char === "\n" || char === ";") {
      const text = body.slice(start, index);
      if (text.trim()) statements.push({ text, offset: bodyStart + start });
      start = index + 1;
    }
  }

  return statements;
}

/** The masked statement, collapsed to one line, as evidence for a finding. */
function evidenceOf(statement: string): string {
  return statement.trim().replace(/\s+/g, " ").slice(0, 200);
}

function mentions(statement: string, names: readonly string[]): boolean {
  return names.some((name) =>
    new RegExp(`\\b${escapeName(name)}\\b`).test(statement),
  );
}

/**
 * Content identity of one script's source.
 *
 * Deliberately the ARTIFACT-CONTRACT-2 construction for a string payload —
 * `sha256` over the canonical JSON encoding, which for a string is exactly its
 * JSON form. It is computed here rather than imported so the validation layer
 * keeps no dependency on the pipeline layer; a test pins the two against each
 * other so they cannot drift apart silently.
 */
function scriptContentHash(content: string): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex")}`;
}

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
  const reviewedScripts: ReviewedScript[] = [];

  for (const script of scripts ?? []) {
    const path = typeof script?.path === "string" ? script.path : "";
    const content = script?.content;

    // Unreadable input is recorded as unread, never skipped silently. A script
    // the reviewer could not parse must not disappear from the report and
    // leave the remainder reading as a complete review.
    if (typeof content !== "string" || !path) {
      reviewedScripts.push({
        path: path || "(unnamed script)",
        contentHash: null,
        outcome: "not_inspected",
        reason: "Script content is not readable source text.",
      });
      continue;
    }

    const contentHash = scriptContentHash(content);
    const server = isServerScript(path);
    const client = isClientScript(path);

    if (!server && !client) {
      // Shared and replicated locations carry no server/client trust boundary,
      // so no rule can apply. That is a deliberate exclusion, and stating it
      // is what stops it from reading as a clean result.
      reviewedScripts.push({
        path,
        contentHash,
        outcome: "not_applicable",
        reason:
          "No rule applies at this location; only server and client scripts carry a trust boundary.",
      });
      continue;
    }

    const source = executableSource(content);
    const before = findings.length;

    if (server) {
      for (const rule of SERVER_SCRIPT_RULES) {
        for (const statement of statementsOf(source, 0)) {
          if (!rule.pattern.test(statement.text)) continue;
          findings.push({
            code: rule.code,
            severity: rule.severity,
            path,
            line: lineOf(content, statement.offset),
            message: rule.message,
            evidence: evidenceOf(statement.text),
            remediation: rule.remediation,
          });
        }
      }

      for (const handler of extractRemoteHandlers(source)) {
        const statements = statementsOf(handler.body, handler.bodyStart);
        const unvalidated = handler.clientParams.filter(
          (param) => !validatesParameter(handler.body, param),
        );

        // Identity rules run against every client parameter, validated or
        // not: indexing a player registry by a client value is dangerous
        // precisely because the general guard reads that indexing as
        // validation.
        for (const rule of IDENTITY_RULES) {
          for (const statement of statements) {
            if (
              !rule.pattern.test(statement.text) ||
              !mentions(statement.text, handler.clientParams)
            ) {
              continue;
            }
            findings.push({
              code: rule.code,
              severity: rule.severity,
              path,
              line: lineOf(content, statement.offset),
              message: `${rule.message}. Client argument(s): ${handler.clientParams.join(", ")}.`,
              evidence: evidenceOf(statement.text),
              remediation: rule.remediation,
            });
          }
        }

        // With no unchecked client argument there is no client authority to
        // misuse, so the rules below cannot apply.
        if (unvalidated.length === 0) continue;

        // A dangerous operation only matters if an unchecked client value
        // actually reaches it. Matching the rule anywhere in the handler
        // would flag `function(player, requestId) Coins.Value += REWARD end`,
        // where the client argument never touches the award — a critical
        // false positive on the most ordinary request-style remote there is.
        const tainted = taintedNames(handler.body, unvalidated);
        for (const rule of RULES) {
          for (const statement of statements) {
            if (
              !rule.pattern.test(statement.text) ||
              !mentions(statement.text, tainted)
            ) {
              continue;
            }
            findings.push({
              code: rule.code,
              severity: rule.severity,
              path,
              line: lineOf(content, statement.offset),
              message: `${rule.message}. Unvalidated client argument(s): ${unvalidated.join(", ")}.`,
              evidence: evidenceOf(statement.text),
              remediation: rule.remediation,
            });
          }
        }
      }
    }

    if (client) {
      for (const statement of statementsOf(source, 0)) {
        if (
          /:SetAsync\s*\(|:UpdateAsync\s*\(|GetDataStore\s*\(/.test(
            statement.text,
          )
        ) {
          findings.push({
            code: "CLIENT_DATASTORE_ACCESS",
            severity: "critical",
            path,
            line: lineOf(content, statement.offset),
            message:
              "A client script reaches for DataStore APIs, which do not exist on the client and signal server logic placed on the client",
            evidence: evidenceOf(statement.text),
            remediation: "Move persistence to a server Script.",
          });
        }
        if (/\bServerStorage\b|\bServerScriptService\b/.test(statement.text)) {
          findings.push({
            code: "CLIENT_SERVER_CONTAINER_ACCESS",
            severity: "high",
            path,
            line: lineOf(content, statement.offset),
            message:
              "A client script references a server-only container, which is not replicated and indicates a misplaced trust boundary",
            evidence: evidenceOf(statement.text),
            remediation:
              "Keep server-only assets on the server and expose what the client needs through ReplicatedStorage.",
          });
        }
      }
    }

    reviewedScripts.push({
      path,
      contentHash,
      outcome: findings.length > before ? "finding" : "pass",
    });
  }

  const deduped = dedupeFindings(findings);

  return {
    schemaVersion: SECURITY_REVIEW_SCHEMA_VERSION,
    // Constants, not computed from the findings. Enforcement is a property of
    // the regime that produced the report, never of what it happened to find,
    // so a report with findings is no more blocking than a clean one.
    analysisMode: SECURITY_REVIEW_ANALYSIS_MODE,
    enforcement: SECURITY_REVIEW_ENFORCEMENT,
    outcome: reportOutcome(reviewedScripts, deduped),
    reviewedScriptCount: reviewedScripts.filter(
      (script) => script.outcome === "pass" || script.outcome === "finding",
    ).length,
    suppliedScriptCount: reviewedScripts.length,
    scripts: reviewedScripts,
    findings: deduped,
    clean: reportOutcome(reviewedScripts, deduped) === "pass",
    limits: [...REVIEW_LIMITS],
  };
}

/**
 * Collapse identical findings and order them deterministically.
 *
 * Two handlers with the same defect used to produce two findings a reader
 * could not tell apart. Ordering is by path, then line, then code, so the same
 * input always yields byte-identical output regardless of the order rules or
 * handlers happened to be scanned in.
 */
function dedupeFindings(
  findings: readonly SecurityFinding[],
): SecurityFinding[] {
  const seen = new Map<string, SecurityFinding>();

  for (const finding of findings) {
    const key = `${finding.path} ${finding.line ?? -1} ${finding.code} ${finding.evidence}`;
    if (!seen.has(key)) seen.set(key, finding);
  }

  return [...seen.values()].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      (left.line ?? Number.MAX_SAFE_INTEGER) -
        (right.line ?? Number.MAX_SAFE_INTEGER) ||
      left.code.localeCompare(right.code) ||
      left.evidence.localeCompare(right.evidence),
  );
}

/**
 * What the review as a whole concluded.
 *
 * `pass` is the narrowest of the four and is reached only when every supplied
 * script was analysed and nothing fired. Anything the reviewer could not read
 * makes the whole report `not_inspected`, because a pass over part of the
 * input reads as a pass over all of it.
 */
function reportOutcome(
  scripts: readonly ReviewedScript[],
  findings: readonly SecurityFinding[],
): SecurityReviewOutcome {
  if (findings.length > 0) return "finding";
  if (scripts.some((script) => script.outcome === "not_inspected")) {
    return "not_inspected";
  }
  if (scripts.some((script) => script.outcome === "pass")) return "pass";
  if (scripts.length > 0) return "not_applicable";
  // Nothing was supplied at all. This is the path a failed or missing Lua
  // artifact reaches, and it must never look like a clean review.
  return "not_inspected";
}

/**
 * Whether a report still describes the given scripts.
 *
 * Staleness is detectable rather than merely recorded: a consumer holding the
 * current Lua can ask this directly. A report that reviewed different bytes,
 * or a different set of scripts, does not describe them.
 */
export function securityReviewMatchesScripts(
  report: Pick<SecurityReviewReport, "scripts">,
  scripts: readonly ReviewableScript[],
): boolean {
  const reviewed = new Map(
    (report.scripts ?? []).map((script) => [script.path, script.contentHash]),
  );
  if (reviewed.size !== (scripts?.length ?? 0)) return false;

  return (scripts ?? []).every(
    (script) =>
      typeof script?.content === "string" &&
      reviewed.get(script.path) === scriptContentHash(script.content),
  );
}
