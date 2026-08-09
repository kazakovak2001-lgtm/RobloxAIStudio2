import { describe, it, expect } from "vitest";

import {
  GAME_GENERATION_PIPELINE,
  selectPipelineNodes,
  validatePipelineDefinition,
  type PipelineDefinition,
} from "../planning/core/pipelineDefinition";
import {
  PlannerEngine,
  PlanValidationError,
} from "../planning/core/PlannerEngine";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { PlanExecutor } from "../planning/execution/PlanExecutor";
import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../socket/streaming";
import { ArtifactStore } from "../pipeline/v2";
import type { CreateBlueprintInput } from "../projects/types/blueprint";
import { createPlanningRouter } from "../routes/planning";
import type { ProjectAccessControl } from "../routes/projects";

/**
 * PIPELINE-1A. The pipeline is server-owned, versioned data, and a plan that
 * cannot run is refused before it runs rather than stranding the executor.
 *
 * `requiredAgents` is client-supplied on `POST /api/plan/create` and on the
 * v1 plan route, so these are trust-boundary tests, not shape tests.
 */
const USER_ID = "pipeline1a-user";
const PROJECT_ID = "pipeline1a-project";

function blueprintInput(): CreateBlueprintInput {
  return {
    project_id: PROJECT_ID,
    user_id: USER_ID,
    name: "Pipeline Identity Game",
    description: "A blueprint used only to exercise pipeline provenance.",
    game_type: "adventure",
    genre: ["adventure"],
    target_audience: "all ages",
    difficulty: "medium",
    estimated_players: "small-group",
    gameplay: { mechanics: [], progression: {}, balance: {} },
    ui_layouts: [],
    architecture: {
      client_architecture: {},
      server_architecture: {},
      networking: {},
    },
    assets: { models: [], textures: [], sounds: [], animations: [] },
    code_spec: { modules: [], patterns: [] },
  };
}

describe("PIPELINE-1A pipeline definition", () => {
  it("keeps the canonical definition internally consistent", () => {
    expect(validatePipelineDefinition(GAME_GENERATION_PIPELINE)).toEqual([]);
  });

  it("names only agents the registry actually provides", () => {
    const registered = new Set(new AgentRegistry().registeredTypes());
    const missing = GAME_GENERATION_PIPELINE.nodes
      .map((node) => node.agent)
      .filter((agent) => !registered.has(agent));

    expect(missing).toEqual([]);
  });

  it("carries an identity and a version that plans can be attributed to", () => {
    expect(GAME_GENERATION_PIPELINE.id).toBe("game-generation");
    expect(Number.isInteger(GAME_GENERATION_PIPELINE.version)).toBe(true);
    expect(GAME_GENERATION_PIPELINE.version).toBeGreaterThan(0);
  });

  it("reports a dependency the definition never declares", () => {
    const broken: PipelineDefinition = {
      id: "broken",
      version: 1,
      nodes: [{ agent: "lua_generator", type: "generation", deps: ["ghost"] }],
    };

    expect(validatePipelineDefinition(broken)).toEqual([
      expect.objectContaining({
        code: "unknown-dependency",
        agent: "lua_generator",
        dependency: "ghost",
      }),
    ]);
  });

  it("reports only the agents that sit on a cycle", () => {
    // `lead` is visited first and reaches the cycle, so a walk that blames
    // the whole traversal stack would name it too.
    const cyclic: PipelineDefinition = {
      id: "cyclic",
      version: 1,
      nodes: [
        { agent: "lead", type: "analysis", deps: ["a"] },
        { agent: "a", type: "generation", deps: ["b"] },
        { agent: "b", type: "generation", deps: ["a"] },
      ],
    };

    const cycles = validatePipelineDefinition(cyclic).filter(
      (issue) => issue.code === "cycle",
    );

    // `lead` leads into the cycle but is not on it. Naming it would send an
    // operator to an edge that is not the problem.
    expect(cycles.map((issue) => issue.agent).sort()).toEqual(["a", "b"]);
  });

  it("reports every member of two cycles that share a node", () => {
    // A back-edge walk finds the cycle through `b`, leaves `d` visited, and
    // then stops at `d` when it walks in through `c` — never noticing that
    // c → d → a → c puts `c` on a cycle too.
    const overlapping: PipelineDefinition = {
      id: "overlapping",
      version: 1,
      nodes: [
        { agent: "a", type: "analysis", deps: ["b", "c"] },
        { agent: "b", type: "generation", deps: ["d"] },
        { agent: "c", type: "generation", deps: ["d"] },
        { agent: "d", type: "synthesis", deps: ["a"] },
      ],
    };

    const cycles = validatePipelineDefinition(overlapping).filter(
      (issue) => issue.code === "cycle",
    );

    expect(cycles.map((issue) => issue.agent).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("reports an agent that depends on itself", () => {
    const selfDependent: PipelineDefinition = {
      id: "self",
      version: 1,
      nodes: [{ agent: "loop", type: "generation", deps: ["loop"] }],
    };

    expect(
      validatePipelineDefinition(selfDependent).filter(
        (issue) => issue.code === "cycle",
      ),
    ).toEqual([expect.objectContaining({ code: "cycle", agent: "loop" })]);
  });

  it("orders a selection by the definition, not by the request", () => {
    const requested = ["orchestrator", "requirements", "planner"];
    const reversed = [...requested].reverse();

    const forward = selectPipelineNodes(GAME_GENERATION_PIPELINE, [
      ...requested,
      "game_designer",
      "lua_generator",
      "ui_generator",
      "asset_planner",
      "roblox_architect",
    ]);
    const backward = selectPipelineNodes(GAME_GENERATION_PIPELINE, [
      ...reversed,
      "roblox_architect",
      "asset_planner",
      "ui_generator",
      "lua_generator",
      "game_designer",
    ]);

    expect(forward.issues).toEqual([]);
    expect(forward.nodes.map((node) => node.agent)).toEqual(
      backward.nodes.map((node) => node.agent),
    );
  });
});

describe("PIPELINE-1A planner refuses an unrunnable request", () => {
  it("rejects a selection that omits a dependency instead of stranding it", () => {
    // Regression. `requiredAgents: ["lua_generator"]` used to produce a single
    // node depending on `task-roblox_architect`, which was never planned. The
    // executor could never mark it ready, so the run ended with nothing done,
    // nothing failed, and no stated reason anywhere.
    const planner = new PlannerEngine();

    let raised: unknown;
    try {
      planner.createPlan({
        intent: "generate",
        constraints: [],
        requiredAgents: ["lua_generator"],
      });
    } catch (error) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(PlanValidationError);
    expect((raised as PlanValidationError).issues).toContainEqual(
      expect.objectContaining({
        code: "unsatisfied-dependency",
        agent: "lua_generator",
        dependency: "roblox_architect",
      }),
    );
  });

  it("rejects an agent name the pipeline does not define", () => {
    // Regression. An unrecognised name used to become an ad-hoc node with no
    // dependencies, which the registry then declined to run.
    const planner = new PlannerEngine();

    expect(() =>
      planner.createPlan({
        intent: "generate",
        constraints: [],
        requiredAgents: ["totally_made_up_agent"],
      }),
    ).toThrow(PlanValidationError);
  });

  it("rejects an empty selection rather than planning nothing", () => {
    const planner = new PlannerEngine();

    expect(() =>
      planner.createPlan({
        intent: "generate",
        constraints: [],
        requiredAgents: [],
      }),
    ).toThrow(PlanValidationError);
  });

  it("still plans the whole pipeline when nothing is requested", () => {
    const plan = new PlannerEngine().createPlan({
      intent: "generate",
      constraints: [],
    });

    expect(plan.graph.getAllNodes().map((node) => node.agent)).toEqual(
      GAME_GENERATION_PIPELINE.nodes.map((node) => node.agent),
    );
    expect(plan.definitionId).toBe(GAME_GENERATION_PIPELINE.id);
    expect(plan.definitionVersion).toBe(GAME_GENERATION_PIPELINE.version);
  });

  it("accepts a narrower selection that is closed over its dependencies", () => {
    const plan = new PlannerEngine().createPlan({
      intent: "generate",
      constraints: [],
      requiredAgents: ["requirements", "planner", "game_designer"],
    });

    expect(plan.graph.getAllNodes().map((node) => node.agent)).toEqual([
      "requirements",
      "planner",
      "game_designer",
    ]);
    expect(plan.graph.validateDAG().valid).toBe(true);
  });
});

/**
 * Resolve a registered handler straight off the router's layer stack.
 *
 * There is no HTTP harness in this repository, and asserting on route source
 * text would not exercise the branch. This calls the real handler.
 */
function resolveHandler(
  router: ReturnType<typeof createPlanningRouter>,
  path: string,
): (req: unknown, res: unknown) => Promise<void> {
  const stack = (
    router as unknown as {
      stack: Array<{
        route?: { path: string; stack: Array<{ handle: unknown }> };
      }>;
    }
  ).stack;
  const layer = stack.find((entry) => entry.route?.path === path);
  if (!layer?.route) throw new Error(`No handler registered for ${path}`);
  return layer.route.stack[0].handle as (
    req: unknown,
    res: unknown,
  ) => Promise<void>;
}

describe("PIPELINE-1A plan route answers a bad selection with 400", () => {
  const grantAccess = {
    getRequestUserId: async () => USER_ID,
    requireAuthenticatedUser: async () => USER_ID,
    requireProjectAccess: async () => true,
    hasProjectAccess: async () => true,
  } as unknown as ProjectAccessControl;

  async function postCreate(body: Record<string, unknown>) {
    const handler = resolveHandler(
      createPlanningRouter(new AgentRegistry(), grantAccess),
      "/create",
    );

    let statusCode = 200;
    let payload: Record<string, unknown> = {};
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: Record<string, unknown>) {
        payload = value;
        return this;
      },
    };

    await handler({ body }, res);
    return { statusCode, payload };
  }

  it("rejects an unbuildable selection as a bad request, not a server fault", async () => {
    // Previously this reached the executor and produced a plan that could
    // never run, or — once the planner started refusing it — a bare 500.
    const { statusCode, payload } = await postCreate({
      projectId: PROJECT_ID,
      intent: "generate",
      requiredAgents: ["lua_generator"],
    });

    expect(statusCode).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.issues).toContainEqual(
      expect.objectContaining({ code: "unsatisfied-dependency" }),
    );
  });

  it("still creates a plan for a selection the pipeline can run", async () => {
    const { statusCode, payload } = await postCreate({
      projectId: PROJECT_ID,
      intent: "generate",
    });

    expect(statusCode).toBe(200);
    expect(payload.success).toBe(true);
  });
});

/**
 * Drive one generation to a terminal state and return the durable record. The
 * service runs the pipeline on a detached queue, so poll rather than assuming
 * completion is synchronous.
 */
async function runGeneration(registry: AgentRegistry) {
  const service = new GameGenerationService(
    new InMemoryBlueprintRepository(),
    new BlueprintCache(),
    new StreamingUpdateHandler(),
    new PipelineEventEmitter(),
    null,
    registry,
    new ArtifactStore(),
  );

  await service.createBlueprint(USER_ID, PROJECT_ID, blueprintInput());
  const started = await service.startGeneration(PROJECT_ID, USER_ID);

  for (let attempt = 0; attempt < 200; attempt++) {
    const current = await service.getExecution(started.id);
    if (current && current.status !== "running") return current;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Generation did not reach a terminal state in time");
}

describe("PIPELINE-1A executor reports only work that happened", () => {
  it("does not count an agent that never ran as a completed node", async () => {
    // Regression. `AgentRegistry.executeAgent` answers `{_skipped: true}` for
    // a name it does not know, and the executor only inspected `_failed`, so
    // a plan naming agents that do not exist finished "successfully" with
    // every node marked done.
    const planner = new PlannerEngine({
      id: "fictional",
      version: 1,
      nodes: [
        { agent: "totally_made_up_agent", type: "custom", deps: [] },
        { agent: "another_fake_one", type: "custom", deps: [] },
      ],
    });
    const plan = planner.createPlan({ intent: "probe", constraints: [] });
    const registry = new AgentRegistry();

    const result = await new PlanExecutor().executePlan(
      plan.planId,
      plan.graph,
      (agent, input) => registry.executeAgent(agent, input),
      { stopOnFailure: false },
    );

    expect(result.success).toBe(false);
    expect(result.completedNodes).toBe(0);
    expect(result.failedNodes).toBe(2);
  });

  it("says why a node never ran instead of leaving it pending", async () => {
    const planner = new PlannerEngine({
      id: "blocked",
      version: 1,
      nodes: [
        { agent: "first", type: "custom", deps: [] },
        { agent: "second", type: "custom", deps: ["first"] },
      ],
    });
    const plan = planner.createPlan({ intent: "probe", constraints: [] });

    const result = await new PlanExecutor().executePlan(
      plan.planId,
      plan.graph,
      (agent) =>
        agent === "first"
          ? Promise.resolve({ _failed: true, _error: "first blew up" })
          : Promise.resolve({ ok: true }),
      { stopOnFailure: false },
    );

    const second = plan.graph.getNode("task-second");
    expect(second?.status).toBe("skipped");
    expect(second?.error).toContain("task-first");
    expect(result.skippedNodes).toBe(1);
    expect(result.success).toBe(false);
  });

  it("stamps the pipeline identity on the durable execution record", async () => {
    // No LLM is wired, so every agent uses its deterministic fallback. That is
    // irrelevant here: which pipeline ran is a property of the plan, not of
    // who authored the content, and PROVIDER-1B already covers authorship.
    const execution = await runGeneration(new AgentRegistry());

    expect(execution?.status).toBe("completed");
    expect(execution?.pipeline_definition).toBe(GAME_GENERATION_PIPELINE.id);
    expect(execution?.pipeline_version).toBe(GAME_GENERATION_PIPELINE.version);
  }, 20000);

  it("still records the pipeline when the run fails after planning", async () => {
    // Every agent answers with something the Lua stage cannot accept, so the
    // artifact recorder throws and the run lands on the failure path. Which
    // pipeline it was running is known by then and must not be dropped.
    const registry = {
      executeAgent: async () => ({ ok: true }),
    } as unknown as AgentRegistry;

    const execution = await runGeneration(registry);

    expect(execution?.status).toBe("failed");
    expect(execution?.pipeline_definition).toBe(GAME_GENERATION_PIPELINE.id);
    expect(execution?.pipeline_version).toBe(GAME_GENERATION_PIPELINE.version);
  }, 20000);

  it("leaves a healthy run reporting every node as completed", async () => {
    const plan = new PlannerEngine().createPlan({
      intent: "generate",
      constraints: [],
    });

    const result = await new PlanExecutor().executePlan(
      plan.planId,
      plan.graph,
      () => Promise.resolve({ ok: true }),
      { stopOnFailure: false },
    );

    expect(result.success).toBe(true);
    expect(result.completedNodes).toBe(GAME_GENERATION_PIPELINE.nodes.length);
    expect(result.failedNodes).toBe(0);
    expect(result.skippedNodes).toBe(0);
  });
});
