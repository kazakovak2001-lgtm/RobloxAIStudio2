import { describe, it, expect } from "vitest";

import {
  AGENT_CAPABILITIES,
  AGENT_DEFINITIONS,
  getAgentDefinition,
  pipelineAgentIds,
  validateAgentDefinitions,
  type AgentDefinition,
} from "../agents/contract/agentContract";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import {
  GAME_GENERATION_PIPELINE,
  validatePipelineDefinition,
  type PipelineDefinition,
} from "../planning/core/pipelineDefinition";
import { PlannerEngine } from "../planning/core/PlannerEngine";
import { PlanExecutor } from "../planning/execution/PlanExecutor";

/**
 * AGENT-CONTRACT-1. One authoritative versioned definition per runtime agent,
 * and every policy in it is consulted by something.
 */

function definitionFor(id: string): AgentDefinition {
  const definition = getAgentDefinition(id);
  if (!definition) throw new Error(`No definition for ${id}`);
  return definition;
}

/** A definition list with one entry replaced, for negative cases. */
function withDefinition(
  id: string,
  patch: Partial<AgentDefinition>,
): AgentDefinition[] {
  return AGENT_DEFINITIONS.map((definition) =>
    definition.id === id ? { ...definition, ...patch } : definition,
  );
}

describe("AGENT-CONTRACT-1 registry integrity", () => {
  it("is internally consistent and matches the running registry", () => {
    // The registry is the only thing that constructs agents, so it is the
    // authority on which implementations exist.
    const issues = validateAgentDefinitions(
      AGENT_DEFINITIONS,
      new AgentRegistry().registeredTypes(),
    );

    expect(issues).toEqual([]);
  });

  it("gives every canonical runtime agent exactly one definition", () => {
    const pipelineIds = GAME_GENERATION_PIPELINE.nodes.map(
      (node) => node.agent,
    );

    for (const id of pipelineIds) {
      const matches = AGENT_DEFINITIONS.filter(
        (definition) => definition.id === id,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].reachability).toBe("pipeline");
    }
    expect([...pipelineAgentIds()].sort()).toEqual([...pipelineIds].sort());
  });

  it("rejects a duplicated agent id", () => {
    const issues = validateAgentDefinitions([
      ...AGENT_DEFINITIONS,
      definitionFor("lua_generator"),
    ]);

    expect(issues.map((issue) => issue.code)).toContain("duplicate-agent-id");
  });

  it("rejects a version that is not a positive integer", () => {
    for (const version of [0, -1, 1.5]) {
      const issues = validateAgentDefinitions(
        withDefinition("planner", { version }),
      );
      expect(issues.map((issue) => issue.code)).toContain("invalid-version");
    }
  });

  it("rejects an unknown capability", () => {
    const issues = validateAgentDefinitions(
      withDefinition("planner", {
        capabilities: ["tycoon-generation"] as never,
      }),
    );

    expect(issues.map((issue) => issue.code)).toContain("unknown-capability");
  });

  it("rejects invalid execution policy values", () => {
    for (const execution of [
      { maxAttempts: 0, maxOutputTokens: 100 },
      { maxAttempts: 3, maxOutputTokens: 0 },
      { maxAttempts: 2.5, maxOutputTokens: 100 },
    ]) {
      const issues = validateAgentDefinitions(
        withDefinition("planner", { execution }),
      );
      expect(issues.map((issue) => issue.code)).toContain(
        "invalid-execution-policy",
      );
    }
  });

  it("rejects a model policy that could never produce output", () => {
    const issues = validateAgentDefinitions(
      withDefinition("planner", {
        model: { requiresModel: false, fallback: "forbidden" },
      }),
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "impossible-model-policy",
    );
  });

  it("rejects an output contract that misdescribes its own validation", () => {
    const claimsValidation = validateAgentDefinitions(
      withDefinition("planner", {
        output: { class: "contract-validated", requiredKeys: ["plan"] },
      }),
    );
    const namesContractWithoutClaiming = validateAgentDefinitions(
      withDefinition("planner", {
        output: {
          class: "parsed-required-keys",
          requiredKeys: ["plan"],
          validatedBy: "somethingElse",
        },
      }),
    );

    expect(claimsValidation.map((issue) => issue.code)).toContain(
      "invalid-output-contract",
    );
    expect(namesContractWithoutClaiming.map((issue) => issue.code)).toContain(
      "invalid-output-contract",
    );
  });

  it("rejects a definition with no implementation, and an implementation with no definition", () => {
    const registered = new AgentRegistry().registeredTypes();

    expect(
      validateAgentDefinitions(
        [
          ...AGENT_DEFINITIONS,
          { ...definitionFor("planner"), id: "ghost_agent" },
        ],
        registered,
      ).map((issue) => issue.code),
    ).toContain("definition-without-implementation");

    expect(
      validateAgentDefinitions(AGENT_DEFINITIONS, [
        ...registered,
        "undefined_agent",
      ]).map((issue) => issue.code),
    ).toContain("implementation-without-definition");
  });

  it("keeps capabilities general rather than genre-shaped", () => {
    // A capability naming a game genre would make the platform a catalogue of
    // templates, which is what the semantic world model exists to avoid.
    const genreWords =
      /(tycoon|obby|simulator|shooter|racing|horror|rpg|battle.?royale)/i;

    for (const capability of AGENT_CAPABILITIES) {
      expect(capability).not.toMatch(genreWords);
    }
    for (const definition of AGENT_DEFINITIONS) {
      expect(definition.id).not.toMatch(genreWords);
    }
  });
});

describe("AGENT-CONTRACT-1 output classification is truthful", () => {
  it("classifies the only contract-validated agent as such", () => {
    // `lua_generator` is the one agent whose accepted-by-the-parser output can
    // still be rejected, by the playability contract.
    const lua = definitionFor("lua_generator");

    expect(lua.output.class).toBe("contract-validated");
    expect(lua.output.validatedBy).toBe("assertPlayableLuaScripts");

    for (const definition of AGENT_DEFINITIONS) {
      if (definition.id === "lua_generator") continue;
      expect(definition.output.class).not.toBe("contract-validated");
    }
  });

  it("states the required keys each agent's parser actually enforces", () => {
    // Spot-checked against the call sites rather than assumed: a required-key
    // list that drifts from the parser would describe a contract nobody keeps.
    expect(definitionFor("requirements").output.requiredKeys).toEqual([
      "requirements",
    ]);
    expect(definitionFor("roblox_architect").output.requiredKeys).toEqual([
      "architecture",
      "roblox_architect",
    ]);
    expect(definitionFor("orchestrator").output.requiredKeys).toEqual([
      "name",
      "world",
      "systems",
      "status",
    ]);
  });
});

describe("AGENT-CONTRACT-1 pipeline integration", () => {
  it("accepts the canonical pipeline", () => {
    expect(validatePipelineDefinition(GAME_GENERATION_PIPELINE)).toEqual([]);
  });

  it("rejects a pipeline node with no agent definition", () => {
    const undefinedAgent: PipelineDefinition = {
      id: "undefined-agent",
      version: 1,
      nodes: [{ agent: "no_such_agent", type: "generation", deps: [] }],
    };

    expect(
      validatePipelineDefinition(undefinedAgent).map((issue) => issue.code),
    ).toContain("undefined-agent");
  });

  it("rejects a pipeline node naming an agent that is not pipeline-reachable", () => {
    // `tester` is registered and defined, and deliberately not on the pipeline.
    const unreachable: PipelineDefinition = {
      id: "unreachable-agent",
      version: 1,
      nodes: [{ agent: "tester", type: "validation", deps: [] }],
    };

    expect(
      validatePipelineDefinition(unreachable).map((issue) => issue.code),
    ).toContain("unreachable-agent");
  });

  it("still runs the existing pipeline through the registry", async () => {
    const plan = new PlannerEngine().createPlan({
      intent: "generate",
      constraints: [],
    });
    const registry = new AgentRegistry();

    const result = await new PlanExecutor().executePlan(
      plan.planId,
      plan.graph,
      (agent, input) => registry.executeAgent(agent, input),
      { stopOnFailure: false },
    );

    expect(result.completedNodes).toBe(GAME_GENERATION_PIPELINE.nodes.length);
    expect(result.failedNodes).toBe(0);
  }, 20000);
});
