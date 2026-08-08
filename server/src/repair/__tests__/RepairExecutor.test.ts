import { describe, expect, it, vi } from "vitest";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../../projects/repository/blueprint.repository";
import { ArtifactStore } from "../../pipeline/v2";
import { getPlayableLuaIssues } from "../../types/playableLua";
import { RepairExecutor } from "../RepairExecutor";
import type { RepairPlan, RepairPlanItem } from "../RepairTypes";

async function seedBlueprint(
  repository: InMemoryBlueprintRepository,
  projectId: string,
): Promise<void> {
  await repository.createBlueprint("repair-test-user", {
    project_id: projectId,
    user_id: "repair-test-user",
    name: "Repair Test Game",
    description: "A blueprint used only to exercise RepairExecutor.",
    game_type: "rpg",
    genre: ["rpg"],
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
  });
}

function planItem(overrides: Partial<RepairPlanItem> = {}): RepairPlanItem {
  return {
    issueId: "issue-1",
    severity: "critical",
    targetArtifact: "World.server.lua",
    repairStrategy: "regenerate_script",
    estimatedImpact: 20,
    priority: 1,
    decision: "repair",
    reason: "No RemoteEvent setup found",
    recommendedFix: "Add a Remotes module in ReplicatedStorage",
    ...overrides,
  };
}

function plan(items: RepairPlanItem[]): RepairPlan {
  return {
    projectId: "repair-test-project",
    iteration: 1,
    items,
    targetScore: 90,
    currentScore: 40,
    createdAt: Date.now(),
  };
}

describe("RepairExecutor", () => {
  it("fails closed for every strategy except regenerate_script", async () => {
    const registry = new AgentRegistry();
    const blueprintRepository = new InMemoryBlueprintRepository();
    const artifactStore = new ArtifactStore();
    const executor = new RepairExecutor(
      registry,
      blueprintRepository,
      artifactStore,
    );

    const unimplemented = plan([
      planItem({ repairStrategy: "create_remote_event" }),
      planItem({ repairStrategy: "move_script" }),
      planItem({ repairStrategy: "fix_asset_reference" }),
    ]);

    const outcome = await executor.execute(unimplemented, {
      projectId: "repair-test-project",
      parentExecutionId: "does-not-exist",
      scripts: [],
    });

    expect(outcome.results).toHaveLength(3);
    for (const result of outcome.results) {
      expect(result.applied).toBe(false);
      expect(result.description).toContain("not yet implemented");
    }
    expect(outcome.scripts).toEqual([]);
  });

  it("skips ignored and escalated items without invoking the agent", async () => {
    const registry = new AgentRegistry();
    const blueprintRepository = new InMemoryBlueprintRepository();
    const artifactStore = new ArtifactStore();
    const executor = new RepairExecutor(
      registry,
      blueprintRepository,
      artifactStore,
    );

    const outcome = await executor.execute(
      plan([
        planItem({ decision: "ignore" }),
        planItem({ decision: "escalate" }),
      ]),
      { projectId: "repair-test-project", parentExecutionId: "x", scripts: [] },
    );

    expect(outcome.results.every((r) => !r.applied)).toBe(true);
    expect(outcome.results[0].description).toContain("decision=ignore");
    expect(outcome.results[1].description).toContain("decision=escalate");
  });

  it("regenerates the whole package and threads the issue reason into the prompt", async () => {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");

    const playable = await luaAgent.execute({
      blueprint: { name: "Repair Test Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    const generate = vi.fn().mockResolvedValue(JSON.stringify(playable.data));
    luaAgent.setLLM({ generate });

    const blueprintRepository = new InMemoryBlueprintRepository();
    await seedBlueprint(blueprintRepository, "repair-test-project");
    const artifactStore = new ArtifactStore();
    await artifactStore.store(
      "parent-exec",
      "ARCHITECTURE",
      "roblox_architect",
      { services: ["WorldService"] },
    );
    await artifactStore.store("parent-exec", "GAME_DESIGN", "game_designer", {
      gameplay: { mechanics: [{ name: "Collecting" }] },
    });

    const executor = new RepairExecutor(
      registry,
      blueprintRepository,
      artifactStore,
    );

    const outcome = await executor.execute(
      plan([planItem({ reason: "No RemoteEvent setup found" })]),
      {
        projectId: "repair-test-project",
        parentExecutionId: "parent-exec",
        scripts: [],
      },
    );

    expect(outcome.results[0].applied).toBe(true);
    expect(getPlayableLuaIssues(outcome.scripts)).toEqual([]);
    expect(generate.mock.calls[0]?.[0]).toContain("No RemoteEvent setup found");
  });

  it("fails closed when regeneration cannot be completed", async () => {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");
    luaAgent.setLLM({
      generate: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });

    const blueprintRepository = new InMemoryBlueprintRepository();
    await seedBlueprint(blueprintRepository, "repair-test-project");
    const artifactStore = new ArtifactStore();
    const executor = new RepairExecutor(
      registry,
      blueprintRepository,
      artifactStore,
    );

    const outcome = await executor.execute(plan([planItem()]), {
      projectId: "repair-test-project",
      parentExecutionId: "parent-exec",
      scripts: [],
    });

    expect(outcome.results[0].applied).toBe(false);
    expect(outcome.scripts).toEqual([]);
  });

  it("returns null without persisting anything when no blueprint exists for the project", async () => {
    const registry = new AgentRegistry();
    const blueprintRepository = new InMemoryBlueprintRepository();
    const artifactStore = new ArtifactStore();
    const executor = new RepairExecutor(
      registry,
      blueprintRepository,
      artifactStore,
    );

    const outcome = await executor.execute(plan([planItem()]), {
      projectId: "project-without-a-blueprint",
      parentExecutionId: "parent-exec",
      scripts: [],
    });

    expect(outcome.results[0].applied).toBe(false);
  });
});
