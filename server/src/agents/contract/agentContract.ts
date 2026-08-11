/**
 * agentContract.ts
 *
 * AGENT-CONTRACT-1. One authoritative, versioned, server-owned definition per
 * runtime agent.
 *
 * The knowledge this file makes explicit was previously spread across agent
 * classes, the registry, the pipeline definition, prompt call sites and the
 * heads of whoever had read them: that `lua_generator` returns Lua validated
 * against a playability contract, that `ui_generator` may fall back to canned
 * content, that `orchestrator` needs four keys before its output means
 * anything. None of that was checkable.
 *
 * Two rules govern what may appear here.
 *
 * **A field that nothing consults is not a contract.** Every policy below is
 * read at execution or validation time. Dimensions the platform cannot
 * currently enforce — per-agent provider selection, wall-clock timeout,
 * monetary cost — are recorded as unsupported in the scope record rather than
 * given decorative fields that would imply guarantees the runtime does not
 * make.
 *
 * **Capabilities describe production, not marketing.** They stay general and
 * composable. A `TycoonAgent` or `ObbyAgent` primitive would make the platform
 * a catalogue of templates, which is exactly what the world model exists to
 * avoid.
 *
 * Pure module: no I/O, no clock, no provider calls.
 */

/** Shape version of the registry itself, not of any one definition. */
export const AGENT_CONTRACT_VERSION = 1;

/**
 * What an agent can produce or reason about.
 *
 * Deliberately small: one entry per capability the platform actually exercises
 * today. A capability with no definition behind it is a claim about the future.
 */
export const AGENT_CAPABILITIES = [
  "requirements-analysis",
  "planning",
  "game-design",
  "architecture-design",
  "lua-generation",
  "ui-generation",
  "asset-planning",
  "orchestration",
  "validation-reporting",
  "performance-analysis",
  "documentation",
  "data-modeling",
  "debugging",
  "repository-review",
] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

/**
 * How far an agent is from the canonical generation path.
 *
 * Recorded because "registered" and "reachable" have never been the same thing
 * here, and a definition for an unreachable agent must not read as a promise
 * that the pipeline runs it.
 */
export const AGENT_REACHABILITY = [
  /** Named by the canonical pipeline definition; runs on every generation. */
  "pipeline",
  /** Registered and callable, but no pipeline node references it. */
  "registered-only",
  /** Reviews this repository, not generated games. Never on a game path. */
  "development-tool",
] as const;
export type AgentReachability = (typeof AGENT_REACHABILITY)[number];

/**
 * How truthful the output shape is.
 *
 * Parsing succeeding is not the same as the output being valid, which is why
 * `parsed-required-keys` and `contract-validated` are different classes: the
 * first means required keys are present, the second means a separate contract
 * accepted the content.
 */
export const AGENT_OUTPUT_CLASSES = [
  /** Provider text parsed to JSON with required keys enforced. */
  "parsed-required-keys",
  /** As above, and then checked by a domain contract that can reject it. */
  "contract-validated",
  /** Deterministic content only; no provider is consulted. */
  "deterministic",
] as const;
export type AgentOutputClass = (typeof AGENT_OUTPUT_CLASSES)[number];

/** Whether deterministic canned content may stand in for model output. */
export const AGENT_FALLBACK_POLICIES = ["allowed", "forbidden"] as const;
export type AgentFallbackPolicy = (typeof AGENT_FALLBACK_POLICIES)[number];

export interface AgentOutputContract {
  readonly class: AgentOutputClass;
  /**
   * Keys the agent's own parser requires before accepting provider output.
   * Empty for deterministic agents.
   */
  readonly requiredKeys: readonly string[];
  /**
   * The contract that can reject accepted-but-wrong content, when one exists.
   * Present only for `contract-validated`.
   */
  readonly validatedBy?: string;
}

export interface AgentExecutionPolicy {
  /**
   * Attempts inside the agent before it yields to its fallback. This is the
   * real loop in `BaseAgent.generateWithRetry`, not an aspiration.
   */
  readonly maxAttempts: number;
  /**
   * Output token ceiling passed to the provider on each attempt. Enforced by
   * the provider call itself.
   */
  readonly maxOutputTokens: number;
}

export interface AgentModelPolicy {
  /**
   * Whether the agent needs a provider to do its job at all. Enforced: an
   * agent that requires one and has none fails instead of quietly returning
   * canned content.
   */
  readonly requiresModel: boolean;
  readonly fallback: AgentFallbackPolicy;
}

/**
 * AGENT-SAFETY-1. How much authority an agent holds, as a ladder.
 *
 * The audit that produced this found something worth stating plainly: no
 * agent in this platform can cause a durable side effect. Agents are pure
 * input to output; the recorder, the executor and the services decide what is
 * persisted or delivered. Every agent therefore sits at `propose` or below,
 * and nothing claims `execute`.
 *
 * `execute` is named anyway, and `validateAgentDefinitions` **refuses** any
 * definition that claims it, so the tier cannot be granted by editing a table.
 * Introducing a real execute path is a later slice that has to remove that
 * guard deliberately rather than by accident.
 */
export const AGENT_AUTHORITY_TIERS = [
  "observe",
  "plan",
  "propose",
  "execute",
] as const;
export type AgentAuthorityTier = (typeof AGENT_AUTHORITY_TIERS)[number];

/** Ordering, so one tier can be compared against another. */
const AUTHORITY_RANK: Readonly<Record<AgentAuthorityTier, number>> = {
  observe: 0,
  plan: 1,
  propose: 2,
  execute: 3,
};

export interface AgentAuthority {
  readonly tier: AgentAuthorityTier;
  /**
   * Whether this agent may cause another agent to run.
   *
   * Enforced in `AgentRegistry.executeAgent`: a delegated call from an agent
   * whose definition says `false` is refused before the callee is even
   * constructed.
   */
  readonly mayDelegate: boolean;
}
export interface AgentDefinition {
  /** Stable identity. The registry key, not the class name. */
  readonly id: string;
  /**
   * Contract version. Bumped when capabilities, output contract, execution,
   * model policy **or authority** change — a class rename is not a version
   * change, and a version is not a class name.
   *
   * 2 — AGENT-SAFETY-1 added `authority`. Every definition declares something
   * it did not before, so a consumer reading version 1 cannot know whether an
   * authority tier was declared, and `pipeline_steps[].agent_version` rows
   * from either side of the change must stay distinguishable.
   */
  readonly version: number;
  readonly title: string;
  readonly capabilities: readonly AgentCapability[];
  readonly reachability: AgentReachability;
  readonly output: AgentOutputContract;
  readonly execution: AgentExecutionPolicy;
  readonly model: AgentModelPolicy;
  readonly authority: AgentAuthority;
}

/**
 * The canonical registry.
 *
 * Every entry states what the implementation does today. Where an agent's
 * behaviour and its definition disagree, the definition is wrong and must be
 * corrected — it is a description of the runtime, not a wish.
 */
export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  {
    id: "requirements",
    version: 2,
    title: "Turns a blueprint into structured requirements",
    capabilities: ["requirements-analysis"],
    reachability: "pipeline",
    output: { class: "parsed-required-keys", requiredKeys: ["requirements"] },
    execution: { maxAttempts: 3, maxOutputTokens: 1200 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "plan", mayDelegate: false },
  },
  {
    id: "planner",
    version: 2,
    title: "Produces the delivery plan for a generation",
    capabilities: ["planning"],
    reachability: "pipeline",
    output: { class: "parsed-required-keys", requiredKeys: ["plan"] },
    execution: { maxAttempts: 3, maxOutputTokens: 1000 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "plan", mayDelegate: false },
  },
  {
    id: "game_designer",
    version: 2,
    title: "Designs mechanics, progression and balance",
    capabilities: ["game-design"],
    reachability: "pipeline",
    output: { class: "parsed-required-keys", requiredKeys: ["gameplay"] },
    execution: { maxAttempts: 3, maxOutputTokens: 1800 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "propose", mayDelegate: false },
  },
  {
    id: "roblox_architect",
    version: 2,
    title: "Designs services, data models and API contracts",
    capabilities: ["architecture-design"],
    reachability: "pipeline",
    output: {
      class: "parsed-required-keys",
      requiredKeys: ["architecture", "roblox_architect"],
    },
    execution: { maxAttempts: 3, maxOutputTokens: 2000 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "propose", mayDelegate: false },
  },
  {
    id: "lua_generator",
    version: 2,
    title: "Generates the runnable Luau package",
    capabilities: ["lua-generation"],
    reachability: "pipeline",
    // The only agent whose output is checked by a contract that can reject
    // content the parser accepted.
    output: {
      class: "contract-validated",
      requiredKeys: ["lua_generator"],
      validatedBy: "assertPlayableLuaScripts",
    },
    // One attempt, not the BaseAgent default of three: LuaGeneratorAgent
    // constructs its base with `maxRetries: 1`, so a propagated provider or
    // parser error ends the run immediately. Its own repair pass is inside
    // `process`, not in the outer loop.
    execution: { maxAttempts: 1, maxOutputTokens: 4000 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "propose", mayDelegate: false },
  },
  {
    id: "ui_generator",
    version: 2,
    title: "Designs the interface the client builds",
    capabilities: ["ui-generation"],
    reachability: "pipeline",
    output: { class: "parsed-required-keys", requiredKeys: ["uiDesign"] },
    execution: { maxAttempts: 3, maxOutputTokens: 1500 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "propose", mayDelegate: false },
  },
  {
    id: "asset_planner",
    version: 2,
    title: "Plans the assets a generation expects to need",
    capabilities: ["asset-planning"],
    reachability: "pipeline",
    output: { class: "parsed-required-keys", requiredKeys: ["assetPlan"] },
    execution: { maxAttempts: 3, maxOutputTokens: 1500 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "propose", mayDelegate: false },
  },
  {
    id: "orchestrator",
    version: 2,
    title: "Assembles the export package from prior stages",
    capabilities: ["orchestration"],
    reachability: "pipeline",
    output: {
      class: "parsed-required-keys",
      requiredKeys: ["name", "world", "systems", "status"],
    },
    execution: { maxAttempts: 3, maxOutputTokens: 2000 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "propose", mayDelegate: true },
  },
  {
    id: "tester",
    version: 2,
    title: "Produces a test plan — not a validation result",
    capabilities: ["validation-reporting"],
    // Deliberately not on the pipeline. Its output is a checklist of pending
    // tests; recorded as a validation artifact it would read as a clean result
    // for work that never ran. See PIPELINE-1B.
    reachability: "registered-only",
    output: { class: "parsed-required-keys", requiredKeys: ["testResults"] },
    execution: { maxAttempts: 3, maxOutputTokens: 800 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "observe", mayDelegate: false },
  },
  {
    id: "performance",
    version: 2,
    title: "Suggests optimizations for generated content",
    capabilities: ["performance-analysis"],
    reachability: "registered-only",
    output: { class: "parsed-required-keys", requiredKeys: ["optimization"] },
    execution: { maxAttempts: 3, maxOutputTokens: 800 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "observe", mayDelegate: false },
  },
  {
    id: "documentation",
    version: 2,
    title: "Writes documentation for a generated project",
    capabilities: ["documentation"],
    reachability: "registered-only",
    output: { class: "parsed-required-keys", requiredKeys: ["documentation"] },
    execution: { maxAttempts: 3, maxOutputTokens: 1000 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "observe", mayDelegate: false },
  },
  {
    id: "database_designer",
    version: 2,
    title: "Designs persistence structures",
    capabilities: ["data-modeling"],
    reachability: "registered-only",
    output: { class: "parsed-required-keys", requiredKeys: ["database"] },
    execution: { maxAttempts: 3, maxOutputTokens: 800 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "plan", mayDelegate: false },
  },
  {
    id: "debugger",
    version: 2,
    title: "Analyses reported faults in generated content",
    capabilities: ["debugging"],
    reachability: "registered-only",
    output: { class: "parsed-required-keys", requiredKeys: ["debugReport"] },
    execution: { maxAttempts: 3, maxOutputTokens: 800 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "observe", mayDelegate: false },
  },
  {
    id: "architecture_controller",
    version: 2,
    title: "Reviews this repository's architecture boundaries",
    capabilities: ["repository-review"],
    reachability: "development-tool",
    output: { class: "parsed-required-keys", requiredKeys: ["architecture"] },
    execution: { maxAttempts: 3, maxOutputTokens: 2000 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "observe", mayDelegate: false },
  },
  {
    id: "code_review_controller",
    version: 2,
    title: "Reviews this repository's source changes",
    capabilities: ["repository-review"],
    reachability: "development-tool",
    output: { class: "parsed-required-keys", requiredKeys: ["review"] },
    execution: { maxAttempts: 3, maxOutputTokens: 2000 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "observe", mayDelegate: false },
  },
  {
    id: "duplication_detector",
    version: 2,
    title: "Finds duplicated implementations in this repository",
    capabilities: ["repository-review"],
    reachability: "development-tool",
    output: { class: "parsed-required-keys", requiredKeys: ["duplication"] },
    execution: { maxAttempts: 3, maxOutputTokens: 2000 },
    model: { requiresModel: false, fallback: "allowed" },
    authority: { tier: "observe", mayDelegate: false },
  },
];

export type AgentContractIssueCode =
  | "duplicate-agent-id"
  | "invalid-version"
  | "unknown-capability"
  | "empty-capabilities"
  | "invalid-execution-policy"
  | "invalid-output-contract"
  | "impossible-model-policy"
  | "definition-without-implementation"
  | "implementation-without-definition"
  | "execution-policy-mismatch"
  | "unknown-authority-tier"
  | "unsupported-execute-authority"
  | "delegation-without-authority";

export interface AgentContractIssue {
  readonly code: AgentContractIssueCode;
  readonly agentId?: string;
  readonly message: string;
}

/**
 * Check the registry's own integrity, independent of any request.
 *
 * `registeredIds` and `attemptsById` are passed in rather than imported so this
 * module stays pure and the registry stays the only thing that constructs
 * agents.
 *
 * `attemptsById` is the retry ceiling each constructed agent actually loops.
 * Supplying it reconciles the declared `maxAttempts` against the running
 * implementation, so an agent that overrides `maxRetries` cannot leave the
 * definition claiming a number of attempts the runtime never makes.
 */
export function validateAgentDefinitions(
  definitions: readonly AgentDefinition[] = AGENT_DEFINITIONS,
  registeredIds?: readonly string[],
  attemptsById?: Readonly<Record<string, number>>,
): AgentContractIssue[] {
  const issues: AgentContractIssue[] = [];
  const seen = new Set<string>();

  for (const definition of definitions) {
    if (seen.has(definition.id)) {
      issues.push({
        code: "duplicate-agent-id",
        agentId: definition.id,
        message: `Agent "${definition.id}" is defined more than once; an id is a single authoritative definition`,
      });
    }
    seen.add(definition.id);

    if (!Number.isInteger(definition.version) || definition.version < 1) {
      issues.push({
        code: "invalid-version",
        agentId: definition.id,
        message: `Agent "${definition.id}" has a version that is not a positive integer`,
      });
    }

    const authority = definition.authority;
    if (
      !authority ||
      !AGENT_AUTHORITY_TIERS.includes(authority.tier) ||
      typeof authority.mayDelegate !== "boolean"
    ) {
      issues.push({
        code: "unknown-authority-tier",
        agentId: definition.id,
        message: `Agent "${definition.id}" declares no well-formed authority tier`,
      });
    } else {
      // Nothing in this platform can cause a durable side effect from inside
      // an agent, so nothing may claim it can. Granting `execute` has to be a
      // deliberate later slice that removes this check, not a table edit.
      if (authority.tier === "execute") {
        issues.push({
          code: "unsupported-execute-authority",
          agentId: definition.id,
          message: `Agent "${definition.id}" claims execute authority, which no runtime path grants`,
        });
      }
      // Delegation is causing other work to run. An agent that only observes
      // has no standing to do that.
      if (authority.mayDelegate && authority.tier === "observe") {
        issues.push({
          code: "delegation-without-authority",
          agentId: definition.id,
          message: `Agent "${definition.id}" observes only, so it may not invoke other agents`,
        });
      }
    }
    if (definition.capabilities.length === 0) {
      issues.push({
        code: "empty-capabilities",
        agentId: definition.id,
        message: `Agent "${definition.id}" declares no capability, so nothing can select it`,
      });
    }
    for (const capability of definition.capabilities) {
      if (!AGENT_CAPABILITIES.includes(capability)) {
        issues.push({
          code: "unknown-capability",
          agentId: definition.id,
          message: `Agent "${definition.id}" declares an unknown capability "${capability}"`,
        });
      }
    }

    const { maxAttempts, maxOutputTokens } = definition.execution;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      issues.push({
        code: "invalid-execution-policy",
        agentId: definition.id,
        message: `Agent "${definition.id}" must allow at least one attempt`,
      });
    }
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
      issues.push({
        code: "invalid-execution-policy",
        agentId: definition.id,
        message: `Agent "${definition.id}" must declare a positive output token ceiling`,
      });
    }

    if (
      definition.output.class === "deterministic" &&
      definition.output.requiredKeys.length > 0
    ) {
      issues.push({
        code: "invalid-output-contract",
        agentId: definition.id,
        message: `Agent "${definition.id}" is deterministic, so it cannot require keys from provider output`,
      });
    }
    if (
      definition.output.class === "contract-validated" &&
      !definition.output.validatedBy
    ) {
      issues.push({
        code: "invalid-output-contract",
        agentId: definition.id,
        message: `Agent "${definition.id}" claims contract validation but names no contract`,
      });
    }
    if (
      definition.output.class !== "contract-validated" &&
      definition.output.validatedBy
    ) {
      issues.push({
        code: "invalid-output-contract",
        agentId: definition.id,
        message: `Agent "${definition.id}" names a validating contract but is not classified as contract-validated`,
      });
    }

    // An agent that neither requires a model nor may fall back has no way to
    // produce anything.
    if (
      !definition.model.requiresModel &&
      definition.model.fallback === "forbidden"
    ) {
      issues.push({
        code: "impossible-model-policy",
        agentId: definition.id,
        message: `Agent "${definition.id}" forbids deterministic fallback without requiring a model, so it can never produce output`,
      });
    }
    if (
      definition.output.class === "deterministic" &&
      definition.model.requiresModel
    ) {
      issues.push({
        code: "impossible-model-policy",
        agentId: definition.id,
        message: `Agent "${definition.id}" is deterministic but claims to require a model`,
      });
    }
  }

  if (registeredIds) {
    const registered = new Set(registeredIds);
    for (const definition of definitions) {
      if (!registered.has(definition.id)) {
        issues.push({
          code: "definition-without-implementation",
          agentId: definition.id,
          message: `Agent "${definition.id}" is defined but no implementation is registered`,
        });
      }
    }
    for (const id of registered) {
      if (!seen.has(id)) {
        issues.push({
          code: "implementation-without-definition",
          agentId: id,
          message: `Agent "${id}" is registered but has no definition, so nothing states what it produces`,
        });
      }
    }
  }

  if (attemptsById) {
    for (const definition of definitions) {
      const actual = attemptsById[definition.id];
      if (actual === undefined) continue;
      if (actual !== definition.execution.maxAttempts) {
        issues.push({
          code: "execution-policy-mismatch",
          agentId: definition.id,
          message: `Agent "${definition.id}" declares ${definition.execution.maxAttempts} attempts but its implementation loops ${actual}`,
        });
      }
    }
  }

  return issues;
}

const DEFINITIONS_BY_ID = new Map(
  AGENT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

/** The current definition for an agent id, or undefined when there is none. */
export function getAgentDefinition(id: string): AgentDefinition | undefined {
  return DEFINITIONS_BY_ID.get(id);
}

/**
 * Whether a caller at one tier may invoke a callee at another.
 *
 * Exported because it is the one rule with no violator in the current table —
 * every delegating agent sits at the top of the ladder that exists today. It
 * is still evaluated on every delegated call, and testing it directly is
 * honest about that: the rule is enforced, it simply has nothing to refuse yet.
 */
export function mayDelegateAcrossTiers(
  callerTier: AgentAuthorityTier,
  calleeTier: AgentAuthorityTier,
): boolean {
  return AUTHORITY_RANK[calleeTier] <= AUTHORITY_RANK[callerTier];
}
/**
 * Why a delegated call was refused, or `null` when it is permitted.
 *
 * AGENT-SAFETY-1. `OrchestratorAgent` reads the agents to run straight from
 * its own input — `const pipeline = input.pipeline as AgentType[]` — and runs
 * them one by one. PIPELINE-1A made the *generation* pipeline server-owned and
 * validated; this was the remaining path where the set of agents to run was
 * taken on trust. Whoever shapes that input chose which agents ran.
 *
 * The rules are deliberately few, and each refuses something reachable today.
 */
export function delegationRefusal(
  callerId: string,
  calleeId: string,
): string | null {
  const caller = getAgentDefinition(callerId);
  if (!caller) {
    return `No agent definition for delegating agent "${callerId}"`;
  }
  if (!caller.authority.mayDelegate) {
    return `Agent "${callerId}" is not permitted to invoke other agents`;
  }

  const callee = getAgentDefinition(calleeId);
  if (!callee) {
    return `No agent definition for delegated agent "${calleeId}"`;
  }

  // A delegating agent must not reach outside the pipeline. The
  // development-tooling agents review *this repository* rather than a
  // generated game, so a game-generation orchestrator invoking one is an
  // escalation across a boundary the reachability field already names.
  if (callee.reachability !== "pipeline") {
    return `Agent "${callerId}" may not invoke "${calleeId}", which is not pipeline-reachable`;
  }

  // And it must not reach above itself.
  if (!mayDelegateAcrossTiers(caller.authority.tier, callee.authority.tier)) {
    return `Agent "${callerId}" (${caller.authority.tier}) may not invoke "${calleeId}" (${callee.authority.tier}), which holds more authority`;
  }

  return null;
}
/** Agents the canonical pipeline may reference. */
export function pipelineAgentIds(): readonly string[] {
  return AGENT_DEFINITIONS.filter(
    (definition) => definition.reachability === "pipeline",
  ).map((definition) => definition.id);
}
