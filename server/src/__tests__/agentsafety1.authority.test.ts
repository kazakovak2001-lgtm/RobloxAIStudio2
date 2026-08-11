import { describe, it, expect, vi } from "vitest";

import {
  AGENT_AUTHORITY_TIERS,
  AGENT_DEFINITIONS,
  delegationRefusal,
  mayDelegateAcrossTiers,
  getAgentDefinition,
  validateAgentDefinitions,
  type AgentDefinition,
} from "../agents/contract/agentContract";
import { AgentRegistry } from "../agents/core/AgentRegistry";

/**
 * AGENT-SAFETY-1 — Observe / Plan / Propose / Execute.
 *
 * The audit behind this found that no agent can cause a durable side effect,
 * and that exactly one path lets an agent cause *other agents* to run:
 * `OrchestratorAgent` reads the agents to run from its own input. These cover
 * the tier each agent actually holds and the delegation boundary that path
 * crosses.
 */

function withDefinition(
  id: string,
  patch: Partial<AgentDefinition>,
): AgentDefinition[] {
  return AGENT_DEFINITIONS.map((definition) =>
    definition.id === id ? { ...definition, ...patch } : definition,
  );
}

/**
 * The tier every agent is expected to hold.
 *
 * Pinned by id rather than checked for validity: the assignment *is* the
 * security property, and a silent promotion from `observe` to `propose` would
 * pass any weaker assertion while changing what an agent is trusted to do.
 */
const EXPECTED_TIERS: Readonly<Record<string, string>> = {
  requirements: "plan",
  planner: "plan",
  database_designer: "plan",
  game_designer: "propose",
  roblox_architect: "propose",
  lua_generator: "propose",
  ui_generator: "propose",
  asset_planner: "propose",
  orchestrator: "propose",
  tester: "observe",
  performance: "observe",
  documentation: "observe",
  debugger: "observe",
  architecture_controller: "observe",
  code_review_controller: "observe",
  duplication_detector: "observe",
};
describe("AGENT-SAFETY-1 authority is declared truthfully", () => {
  it("holds the exact tier assigned to it, not merely a valid one", () => {
    const actual = Object.fromEntries(
      AGENT_DEFINITIONS.map((definition) => [
        definition.id,
        definition.authority.tier,
      ]),
    );

    expect(actual).toEqual(EXPECTED_TIERS);
    for (const definition of AGENT_DEFINITIONS) {
      expect(AGENT_AUTHORITY_TIERS).toContain(definition.authority.tier);
      expect(typeof definition.authority.mayDelegate).toBe("boolean");
    }
  });

  it("claims no execute authority, because no runtime path grants it", () => {
    // Not an aspiration: agents are pure input to output, and the recorder,
    // executor and services decide what is persisted or delivered.
    for (const definition of AGENT_DEFINITIONS) {
      expect(definition.authority.tier).not.toBe("execute");
    }
  });

  it("refuses a definition that claims execute authority", () => {
    const issues = validateAgentDefinitions(
      withDefinition("lua_generator", {
        authority: { tier: "execute", mayDelegate: false },
      }),
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "unsupported-execute-authority",
    );
  });

  it("refuses a malformed tier", () => {
    const issues = validateAgentDefinitions(
      withDefinition("planner", {
        authority: { tier: "root" as never, mayDelegate: false },
      }),
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "unknown-authority-tier",
    );
  });

  it("refuses delegation authority for an agent that only observes", () => {
    const issues = validateAgentDefinitions(
      withDefinition("tester", {
        authority: { tier: "observe", mayDelegate: true },
      }),
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "delegation-without-authority",
    );
  });

  it("grants delegation to exactly one agent today", () => {
    const delegators = AGENT_DEFINITIONS.filter(
      (definition) => definition.authority.mayDelegate,
    ).map((definition) => definition.id);

    // `OrchestratorAgent` is the only implementation holding a registry
    // reference. If another agent gains one, this fails and asks why.
    expect(delegators).toEqual(["orchestrator"]);
  });
});

describe("AGENT-SAFETY-1 delegation boundary", () => {
  it("permits the delegation the orchestrator actually performs", () => {
    expect(delegationRefusal("orchestrator", "lua_generator")).toBeNull();
    expect(delegationRefusal("orchestrator", "requirements")).toBeNull();
  });

  it("refuses an agent that reviews this repository rather than a game", () => {
    // The escalation the audit found: the delegated pipeline is read straight
    // from input, so whoever shapes that input chose which agents ran — and
    // the development-tooling agents analyse this codebase.
    const refusal = delegationRefusal(
      "orchestrator",
      "architecture_controller",
    );

    expect(refusal).toMatch(/not pipeline-reachable/i);
    expect(delegationRefusal("orchestrator", "duplication_detector")).toMatch(
      /not pipeline-reachable/i,
    );
  });

  it("refuses an agent that holds no delegation authority", () => {
    expect(delegationRefusal("lua_generator", "requirements")).toMatch(
      /not permitted to invoke other agents/i,
    );
  });

  it("refuses reaching above the caller's own tier", () => {
    // Evaluated on every delegated call, with no violator in the current
    // table because every delegating agent already sits at the top of the
    // ladder that exists. Driven directly rather than through a mock, so the
    // rule is tested rather than a stand-in for it.
    expect(mayDelegateAcrossTiers("propose", "plan")).toBe(true);
    expect(mayDelegateAcrossTiers("propose", "propose")).toBe(true);
    expect(mayDelegateAcrossTiers("plan", "propose")).toBe(false);
    expect(mayDelegateAcrossTiers("observe", "plan")).toBe(false);
    expect(mayDelegateAcrossTiers("propose", "execute")).toBe(false);
  });

  it("refuses a delegating agent that has no definition", () => {
    expect(delegationRefusal("ghost_agent", "planner")).toMatch(
      /no agent definition for delegating agent/i,
    );
  });
});

describe("AGENT-SAFETY-1 the registry enforces it", () => {
  it("refuses a delegated call before it runs or reaches a provider", async () => {
    const registry = new AgentRegistry();
    const generate = vi.fn().mockResolvedValue("{}");
    registry.setLLM({ generate });
    // The registry builds every agent in its own constructor, so the callee
    // already exists. What the refusal must prevent is it running at all.
    const callee = registry.getAgent("architecture_controller");
    if (!callee) throw new Error("architecture_controller missing");
    const execute = vi.spyOn(callee, "execute");

    const output = await registry.executeAgent(
      "architecture_controller",
      {},
      { onBehalfOf: "orchestrator" },
    );

    expect(output._failed).toBe(true);
    expect(String(output._error)).toMatch(/not pipeline-reachable/i);
    expect(output._delegatedBy).toBe("orchestrator");
    // Refused on policy, not after seeing what came back.
    expect(execute).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("leaves the platform's own calls unrestricted", async () => {
    // The platform holds full authority over what runs; only delegation is
    // bounded. A direct call to an agent delegation could not reach still
    // works. `tester` is used rather than a controller agent because the
    // controllers walk this repository's AST, which is slow enough to make the
    // assertion about scheduling rather than about authority.
    expect(getAgentDefinition("tester")?.reachability).toBe("registered-only");

    const output = await new AgentRegistry().executeAgent("tester", {});

    expect(output._error).toBeUndefined();
    // And the same agent is refused when an agent asks for it.
    const delegated = await new AgentRegistry().executeAgent(
      "tester",
      {},
      { onBehalfOf: "orchestrator" },
    );
    expect(delegated._failed).toBe(true);
  });

  it("still runs a permitted delegation", async () => {
    const output = await new AgentRegistry().executeAgent(
      "requirements",
      {},
      { onBehalfOf: "orchestrator" },
    );

    expect(output._failed).toBeUndefined();
  });

  it("refuses delegation claimed by an agent that may not delegate", async () => {
    const registry = new AgentRegistry();

    const output = await registry.executeAgent(
      "requirements",
      {},
      { onBehalfOf: "lua_generator" },
    );

    expect(output._failed).toBe(true);
    expect(String(output._error)).toMatch(/not permitted to invoke/i);
  });
});

describe("AGENT-SAFETY-1 the orchestrator delegates under its own authority", () => {
  it("names itself when delegating, so the registry can bound the call", async () => {
    // `runCoordination` discards the registry's `_error`, so a step status
    // alone cannot say *why* it failed. Spying on the call proves the
    // delegation context is passed, which is the part this agent controls.
    const registry = new AgentRegistry();
    const orchestrator = registry.getAgent("orchestrator");
    if (!orchestrator) throw new Error("orchestrator missing");
    const spy = vi.spyOn(registry, "executeAgent");

    await orchestrator.execute({
      mode: "coordinate",
      pipeline: ["architecture_controller"],
      input: {},
    });

    expect(spy).toHaveBeenCalledWith(
      "architecture_controller",
      expect.anything(),
      { onBehalfOf: "orchestrator" },
    );
    // And the registry refused it rather than running the agent.
    const refusal = await spy.mock.results[0].value;
    expect(refusal._failed).toBe(true);
    expect(String(refusal._error)).toMatch(/not pipeline-reachable/i);
  }, 20000);

  it("still coordinates the agents it is allowed to", async () => {
    const registry = new AgentRegistry();
    const orchestrator = registry.getAgent("orchestrator");
    if (!orchestrator) throw new Error("orchestrator missing");

    const result = await orchestrator.execute({
      mode: "coordinate",
      pipeline: ["requirements"],
      input: {},
    });

    const steps = (result.data as { steps?: Array<{ status: string }> })?.steps;
    expect(steps?.[0]?.status).toBe("completed");
  }, 20000);
});

describe("AGENT-SAFETY-1 does not change what the platform may do", () => {
  it("keeps every agent's other contract fields intact", async () => {
    // Authority is additive. A propose-tier agent still produces content and
    // still reports fallback provenance the way PROVIDER-1B requires.
    const output = await new AgentRegistry().executeAgent("planner", {});

    expect(output._usedFallback).toBe(true);
    expect(getAgentDefinition("planner")?.authority.tier).toBe("plan");
  });
});
