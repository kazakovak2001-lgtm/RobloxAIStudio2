import { describe, it, expect } from "vitest";

import {
  buildAssetPlan,
  decodeAssetPlan,
  ASSET_KINDS,
  ASSET_PLAN_SCHEMA_VERSION,
  type AssetPlan,
} from "../validation/assetPlan";
import { buildGenerationValidationReport } from "../validation/generationValidation";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ArtifactStore } from "../pipeline/v2";
import {
  ARTIFACT_DEPENDENCY_RULES,
  REQUIRED_ARTIFACT_DEPENDENCIES,
} from "../pipeline/v2/artifactEnvelope";
import { ProjectSyncManager } from "../studio/v2/sync/ProjectSyncManager";
import { createDefaultPromptEngine } from "../ai/prompts";
import { assembleRepairInput } from "../repair/RepairInputAssembler";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import type { PlayableLuaScript } from "../types/playableLua";
import type { TaskNode } from "../planning/model/TaskGraph";

/**
 * ASSET-FABRIC-1 — the typed asset contract.
 *
 * The plan shipped on every generation and nothing checked it: no schema, no
 * decoder, no lineage. These cover what the contract now states and, as
 * importantly, what it refuses to state.
 */

const PROJECT = "asset-fabric-test-project";

const SERVER_LUA = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progress = Instance.new("RemoteEvent")
progress.Name = "OrbProgress"
progress.Parent = ReplicatedStorage

local arena = Instance.new("Folder")
arena.Name = "GeneratedArena"
arena.Parent = workspace

local spawnPad = Instance.new("SpawnLocation")
spawnPad.Size = Vector3.new(12, 1, 12)
spawnPad.Anchored = true
spawnPad.Parent = arena

local collected = {}

for index = 1, 5 do
  local orb = Instance.new("Part")
  orb.Name = "Orb" .. index
  orb.Anchored = true
  orb.Parent = arena

  orb.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if not player then
      return
    end
    if collected[orb] then
      return
    end
    collected[orb] = true
    orb:Destroy()
    progress:FireAllClients(1, 5)
  end)
end

Players.PlayerAdded:Connect(function(player)
  local stats = Instance.new("Folder")
  stats.Name = "leaderstats"
  stats.Parent = player
end)
`;

const CLIENT_LUA = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Name = "OrbHud"
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Text = "Orbs: 0/5"
label.Parent = gui

ReplicatedStorage:WaitForChild("OrbProgress").OnClientEvent:Connect(function(score, goal)
  label.Text = "Orbs: " .. tostring(score) .. "/" .. tostring(goal)
end)
`;

function luaPackage(): PlayableLuaScript[] {
  return [
    { path: "ServerScriptService/Arena.server.lua", content: SERVER_LUA },
    { path: "StarterPlayerScripts/Hud.client.lua", content: CLIENT_LUA },
  ];
}

/** The exact shape `AssetPlannerAgent` emits, model path and fallback alike. */
function agentOutput(overrides: Record<string, unknown> = {}) {
  return {
    assetPlan: {
      models: [
        {
          id: "model_player",
          name: "PlayerCharacter",
          description: "Main player avatar",
          complexity: "medium",
          source: "builtin",
        },
        {
          id: "model_env_01",
          name: "EnvironmentBase",
          description: "Base world geometry",
          complexity: "simple",
          source: "custom",
        },
      ],
      textures: [
        {
          id: "tex_env_diffuse",
          name: "EnvironmentDiffuse",
          resolution: "1024x1024",
        },
      ],
      sounds: [{ id: "sfx_interact", name: "InteractSound", type: "sfx" }],
      animations: [
        {
          id: "anim_idle",
          name: "PlayerIdle",
          target: "PlayerCharacter",
          frames: 30,
        },
      ],
      ...overrides,
    },
  };
}

function gameDesign() {
  return {
    gameplay: {
      mechanics: [{ name: "collect", description: "Collect the orbs" }],
      balance: { winCondition: "Collect them all" },
    },
  };
}

function node(agent: string, output: Record<string, unknown>): TaskNode {
  return {
    id: `task-${agent}`,
    agent,
    type: "stage",
    input: {},
    dependencies: [],
    status: "done",
    priority: 1,
    output,
  };
}

async function record(
  store: ArtifactStore,
  executionId: string,
  assetOutput?: Record<string, unknown>,
) {
  const nodes = [
    node("game_designer", gameDesign()),
    node("roblox_architect", {
      architecture: { services: { SpawnService: "s" } },
    }),
    node("lua_generator", { scripts: luaPackage() }),
  ];
  if (assetOutput) nodes.push(node("asset_planner", assetOutput));
  return new GenerationArtifactRecorder(store).record(
    executionId,
    nodes,
    PROJECT,
  );
}

function assetCheckOf(artifacts: Awaited<ReturnType<typeof record>>) {
  const validation = artifacts.find((a) => a.stage === "VALIDATION");
  const report = validation?.content as {
    checks: Array<{
      id: string;
      status: string;
      enforcement: string;
      details: string[];
    }>;
    passed: boolean;
    blockingFailures: number;
  };
  return {
    check: report.checks.find((c) => c.id === "assets-planned")!,
    report,
  };
}

describe("ASSET-FABRIC-1 a readable plan", () => {
  it("types every emitted asset kind explicitly", () => {
    const result = buildAssetPlan(agentOutput());

    expect(result.outcome).toBe("planned");
    expect(result.issues).toEqual([]);
    expect(result.plan?.schemaVersion).toBe(ASSET_PLAN_SCHEMA_VERSION);
    // Kind is on the entry, not implied by the array it came from.
    expect(result.plan?.assets.map((a) => `${a.kind}:${a.id}`)).toEqual([
      "model:model_player",
      "model:model_env_01",
      "texture:tex_env_diffuse",
      "sound:sfx_interact",
      "animation:anim_idle",
    ]);
    for (const asset of result.plan!.assets) {
      expect(ASSET_KINDS).toContain(asset.kind);
    }
  });

  it("resolves an animation's model by id rather than by display name", () => {
    // The agent names the target by its `name`. A reference that depends on a
    // label is not a reference, so it is resolved to the id here.
    const animation = buildAssetPlan(agentOutput()).plan!.assets.find(
      (a) => a.id === "anim_idle",
    );

    expect(animation?.references).toEqual(["model_player"]);
  });

  it("decodes kind-specific attributes against their closed sets", () => {
    const byId = new Map(
      buildAssetPlan(agentOutput()).plan!.assets.map((a) => [a.id, a]),
    );

    expect(byId.get("model_player")?.attributes).toEqual({
      complexity: "medium",
      source: "builtin",
    });
    expect(byId.get("tex_env_diffuse")?.attributes).toEqual({
      resolution: "1024x1024",
    });
    expect(byId.get("sfx_interact")?.attributes).toEqual({ soundKind: "sfx" });
    expect(byId.get("anim_idle")?.attributes).toEqual({ frames: 30 });
  });

  it("states purpose where the producer gives one and leaves it absent otherwise", () => {
    // Representable, not invented: only models carry a description today, and
    // nothing the agent emits signals required-ness at all.
    const byId = new Map(
      buildAssetPlan(agentOutput()).plan!.assets.map((a) => [a.id, a]),
    );

    expect(byId.get("model_player")?.purpose).toBe("Main player avatar");
    expect(byId.get("sfx_interact")?.purpose).toBeUndefined();
    for (const asset of buildAssetPlan(agentOutput()).plan!.assets) {
      expect(asset.required).toBeUndefined();
    }
  });
});

describe("ASSET-FABRIC-1 refuses what it cannot read", () => {
  it("reports a malformed top-level contract", () => {
    const result = buildAssetPlan({ assetPlan: { models: "not-an-array" } });

    expect(result.outcome).toBe("invalid");
    expect(result.issues).toEqual([
      { path: "assetPlan.models", message: "models must be an array" },
    ]);
  });

  it("names the offending entry when one asset is malformed", () => {
    const result = buildAssetPlan(
      agentOutput({
        sounds: [
          { id: "sfx_ok", name: "Fine", type: "sfx" },
          { id: "sfx_bad", name: "Broken", type: "orchestral" },
        ],
      }),
    );

    expect(result.outcome).toBe("invalid");
    expect(result.issues).toHaveLength(1);
    // The path identifies the entry, so a reader acts without re-deriving it.
    expect(result.issues[0].path).toBe("assetPlan.sounds[1].type");
    expect(result.issues[0].message).toContain("sfx, music, ambient");
  });

  it("treats a duplicate id as a failure, not a last-one-wins merge", () => {
    const result = buildAssetPlan(
      agentOutput({
        textures: [
          { id: "tex_dup", name: "First", resolution: "512x512" },
          { id: "tex_dup", name: "Second", resolution: "256x256" },
        ],
      }),
    );

    expect(result.outcome).toBe("invalid");
    expect(result.issues[0].path).toBe("assetPlan.textures[1].id");
    expect(result.issues[0].message).toContain("duplicate asset id");
    // And it names where the id was first used, so both ends are locatable.
    expect(result.issues[0].message).toContain("assetPlan.textures[0].id");
  });

  it("reports each missing required field with its own path", () => {
    const result = buildAssetPlan({
      assetPlan: { models: [{ description: "no id, no name, no attributes" }] },
    });

    expect(result.outcome).toBe("invalid");
    expect(result.issues.map((i) => i.path)).toEqual([
      "assetPlan.models[0].complexity",
      "assetPlan.models[0].id",
      "assetPlan.models[0].name",
      "assetPlan.models[0].source",
    ]);
  });

  it("says a target naming no model identifies nothing", () => {
    const result = buildAssetPlan(
      agentOutput({
        animations: [
          { id: "anim_x", name: "Ghost", target: "NoSuchModel", frames: 12 },
        ],
      }),
    );

    expect(result.outcome).toBe("invalid");
    expect(result.issues[0].message).toContain("names no planned model");
  });

  it("refuses a target that names two models rather than picking one", () => {
    const result = buildAssetPlan({
      assetPlan: {
        models: [
          { id: "m1", name: "Twin", complexity: "simple", source: "builtin" },
          { id: "m2", name: "Twin", complexity: "simple", source: "builtin" },
        ],
        animations: [{ id: "a1", name: "A", target: "Twin", frames: 5 }],
      },
    });

    expect(result.outcome).toBe("invalid");
    expect(result.issues[0].message).toContain("identifies none");
  });

  it("distinguishes no plan attempted from an unreadable one", () => {
    expect(buildAssetPlan(undefined).outcome).toBe("not-planned");
    expect(buildAssetPlan({}).outcome).toBe("not-planned");
    expect(buildAssetPlan({ assetPlan: null }).outcome).toBe("not-planned");
    // Present and unreadable is a defect; absent is not.
    expect(buildAssetPlan({ assetPlan: { models: 5 } }).outcome).toBe(
      "invalid",
    );
  });

  it("orders issues by code unit, not by locale", () => {
    // Eleven entries, so both `[1]` and `[10]` appear. Code unit puts `[10]`
    // first, because "0" precedes "]"; `localeCompare` puts `[1]` first and
    // does so differently on hosts with different collations. Fewer entries
    // than this and the two comparators agree, which is what let a
    // locale-based mutation survive the first version of this test.
    const models = Array.from({ length: 11 }, (_, index) => ({
      id: `m${index}`,
      name: `M${index}`,
    }));
    const paths = buildAssetPlan({ assetPlan: { models } }).issues.map(
      (issue) => issue.path,
    );

    expect(paths.indexOf("assetPlan.models[10].complexity")).toBeLessThan(
      paths.indexOf("assetPlan.models[1].complexity"),
    );
    expect([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(
      paths,
    );
  });
});

describe("ASSET-FABRIC-1 decoding stored plans", () => {
  it("round-trips a plan it produced", () => {
    const plan = buildAssetPlan(agentOutput()).plan!;

    expect(decodeAssetPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });

  it("refuses an unsupported schema version outright", () => {
    const plan = buildAssetPlan(agentOutput()).plan!;

    expect(decodeAssetPlan({ ...plan, schemaVersion: 2 })).toBeNull();
    expect(decodeAssetPlan({ ...plan, schemaVersion: undefined })).toBeNull();
  });

  it("returns nothing for a legacy untyped payload rather than inventing a version", () => {
    // Artifacts written before this contract are readable and claim nothing.
    // They are never rewritten or assigned a version they never had.
    expect(decodeAssetPlan(agentOutput().assetPlan)).toBeNull();
  });

  it("refuses a stored plan with a duplicate id or an unknown kind", () => {
    const plan = buildAssetPlan(agentOutput()).plan!;
    const first = plan.assets[0];

    expect(
      decodeAssetPlan({ ...plan, assets: [first, { ...first }] }),
    ).toBeNull();
    expect(
      decodeAssetPlan({
        ...plan,
        assets: [{ ...first, kind: "hologram" }],
      }),
    ).toBeNull();
  });
});

describe("ASSET-FABRIC-1 review findings", () => {
  it("asks the model for the shape the contract requires", () => {
    // The registered production prompt is what a configured provider is sent.
    // It asked for `{name, description}` models with no ids, so every
    // real-provider plan would have been invalid and only the no-LLM fallback
    // could ever have satisfied the contract — which is precisely the trap of
    // testing a contract against its own fallback.
    const rendered = createDefaultPromptEngine().render("asset_planner", {
      name: "Game",
      theme: "neon",
      locations: "hub",
      systems_summary: "collect",
    });

    expect(rendered.success).toBe(true);
    const text = `${rendered.system ?? ""} ${rendered.prompt ?? ""}`;
    expect(text).toContain("unique id");
    for (const field of [
      "id",
      "complexity",
      "source",
      "resolution",
      "frames",
    ]) {
      expect(text).toContain(field);
    }
  });

  it("reads a typed plan back for the repair playtest", async () => {
    // The stored shape changed, and this consumer read only the legacy
    // wrapper — so a typed plan reported zero assets and changed repair
    // scoring on runs with nothing wrong with them.
    const store = new ArtifactStore();
    await record(store, "exec-repair-input", agentOutput());

    const { input } = await assembleRepairInput(
      store,
      PROJECT,
      "exec-repair-input",
    );

    expect(input.assets.map((a) => a.type).sort()).toEqual([
      "animation",
      "model",
      "model",
      "sound",
      "texture",
    ]);
    // Still a plan, never evidence that a binary asset exists.
    expect(input.assets.every((a) => a.placeholder)).toBe(true);
  });

  it("still reads a legacy untyped plan for the repair playtest", async () => {
    const store = new ArtifactStore();
    const design = await store.store(
      "exec-legacy-input",
      "GAME_DESIGN",
      "game_designer",
      gameDesign(),
      { projectId: PROJECT },
    );
    await store.store(
      "exec-legacy-input",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: luaPackage() },
      { projectId: PROJECT },
    );
    await store.store(
      "exec-legacy-input",
      "ASSET_PLANNING",
      "asset_planner",
      agentOutput(),
      {
        projectId: PROJECT,
        dependencies: [ArtifactStore.dependencyOn(design)],
      },
    );

    const { input } = await assembleRepairInput(
      store,
      PROJECT,
      "exec-legacy-input",
    );

    expect(input.assets).toHaveLength(5);
  });

  it("refuses stored attributes whose values contradict the type", () => {
    const plan = buildAssetPlan(agentOutput()).plan!;
    const animation = plan.assets.find((a) => a.kind === "animation")!;
    const swap = (attributes: Record<string, unknown>) =>
      decodeAssetPlan({
        ...plan,
        assets: [{ ...animation, attributes }],
      });

    // `frames: false` would otherwise decode into a PlannedAsset whose
    // attributes contradict the declared type.
    expect(swap({ frames: false })).toBeNull();
    expect(swap({ frames: { nested: true } })).toBeNull();
    expect(swap({ frames: -1 })).toBeNull();
    // A value outside a closed set, and an unrecognised extra key.
    expect(swap({ frames: 10, extra: "x" })).toBeNull();
    expect(swap({ frames: 10 })).not.toBeNull();
  });

  it("orders staged artifacts so a dependency is always committed first", async () => {
    // Lineage resolves only from stages already committed, and `pending`
    // followed the order the plan executor happened to return nodes in. A run
    // that listed the asset stage before the design would have thrown and lost
    // a generation that had already passed validation.
    const store = new ArtifactStore();
    const recorded = await new GenerationArtifactRecorder(store).record(
      "exec-reordered",
      [
        node("asset_planner", agentOutput()),
        node("lua_generator", { scripts: luaPackage() }),
        node("game_designer", gameDesign()),
      ],
      PROJECT,
    );

    const order = recorded.map((a) => a.stage);
    expect(order.indexOf("GAME_DESIGN")).toBeLessThan(
      order.indexOf("ASSET_PLANNING"),
    );
    const asset = recorded.find((a) => a.stage === "ASSET_PLANNING");
    expect(asset?.dependencies?.[0]?.stage).toBe("GAME_DESIGN");
  });
});

describe("ASSET-FABRIC-1 in the pipeline", () => {
  it("stores the typed plan with lineage on the design it derives from", async () => {
    const store = new ArtifactStore();
    const recorded = await record(store, "exec-typed", agentOutput());

    const asset = recorded.find((a) => a.stage === "ASSET_PLANNING");
    const design = recorded.find((a) => a.stage === "GAME_DESIGN");

    expect(asset?.name).toBe("assetPlan.json");
    expect((asset?.content as AssetPlan).schemaVersion).toBe(
      ASSET_PLAN_SCHEMA_VERSION,
    );
    expect(asset?.dependencies).toEqual([
      {
        artifactId: design!.id,
        stage: "GAME_DESIGN",
        contentHash: design!.contentHash,
      },
    ]);
  });

  it("declares the lineage rule the pipeline definition already implies", () => {
    // `pipelineDefinition` gives asset_planner deps ["game_designer"], so the
    // rule names GAME_DESIGN and the stage may not be stored without it.
    expect(ARTIFACT_DEPENDENCY_RULES.ASSET_PLANNING).toEqual(["GAME_DESIGN"]);
    expect(REQUIRED_ARTIFACT_DEPENDENCIES.ASSET_PLANNING).toBe("GAME_DESIGN");
  });

  it("refuses a plan that names no design", async () => {
    const store = new ArtifactStore();

    await expect(
      store.store(
        "exec-unbound",
        "ASSET_PLANNING",
        "asset_planner",
        {},
        {
          projectId: PROJECT,
        },
      ),
    ).rejects.toThrow(/exactly one GAME_DESIGN dependency/);
  });

  it("refuses lineage naming the wrong upstream", async () => {
    const store = new ArtifactStore();
    const recorded = await record(store, "exec-wrong", agentOutput());
    const lua = recorded.find((a) => a.stage === "LUA_GENERATION")!;

    await expect(
      store.store(
        "exec-wrong-2",
        "ASSET_PLANNING",
        "asset_planner",
        {},
        {
          projectId: PROJECT,
          dependencies: [ArtifactStore.dependencyOn(lua)],
        },
      ),
    ).rejects.toThrow();
  });

  it("keeps the malformed output rather than replacing it with a tidy record", async () => {
    const store = new ArtifactStore();
    const broken = agentOutput({ textures: [{ id: "t", name: "T" }] });
    const recorded = await record(store, "exec-broken", broken);

    const asset = recorded.find((a) => a.stage === "ASSET_PLANNING");
    // Stored unchanged and carrying no schemaVersion, so nothing reads it as
    // a valid plan and the original is preserved for inspection.
    expect(asset?.content).toEqual(broken);
    expect(
      (asset?.content as { schemaVersion?: number }).schemaVersion,
    ).toBeUndefined();
  });

  it("reports the plan advisorily and never fails a generation for it", async () => {
    const store = new ArtifactStore();
    const { check, report } = assetCheckOf(
      await record(
        store,
        "exec-advisory",
        agentOutput({ sounds: [{ id: "s" }] }),
      ),
    );

    expect(check.status).toBe("failed");
    expect(check.enforcement).toBe("advisory");
    expect(check.details.join(" ")).toContain("assetPlan.sounds[0]");
    // The generation still passes: a malformed manifest is not a broken game.
    expect(report.passed).toBe(true);
    expect(report.blockingFailures).toBe(0);
  });

  it("says not-applicable when no asset stage ran", async () => {
    const store = new ArtifactStore();
    const { check } = assetCheckOf(await record(store, "exec-none"));

    // Absent is not clean. `not-applicable` says the question was not asked.
    expect(check.status).toBe("not-applicable");
    expect(check.details).toEqual([]);
  });

  it("says not-applicable when the stage ran but planned nothing", async () => {
    // Distinct from the case above: the agent ran and returned output with no
    // plan in it. That is still no plan rather than a broken one, and
    // reporting it as failed would blame the run for a question it never
    // answered.
    const store = new ArtifactStore();
    const recorded = await record(store, "exec-empty", { notes: "no assets" });
    const { check } = assetCheckOf(recorded);

    expect(check.status).toBe("not-applicable");
    expect(check.details).toEqual([]);
    // The output is still recorded, untyped, so nothing is lost.
    const asset = recorded.find((a) => a.stage === "ASSET_PLANNING");
    expect(asset?.content).toEqual({ notes: "no assets" });
  });

  it("passes the check for a readable plan", async () => {
    const store = new ArtifactStore();
    const { check } = assetCheckOf(
      await record(store, "exec-good", agentOutput()),
    );

    expect(check.status).toBe("passed");
  });

  it("decodes the stored plan after a restart", async () => {
    const storage = new InMemoryStorageProvider();
    await record(new ArtifactStore(storage), "exec-restart", agentOutput());

    const afterRestart = new ArtifactStore(storage);
    const stored = afterRestart
      .getByPipeline("exec-restart")
      .find((a) => a.stage === "ASSET_PLANNING");

    const decoded = decodeAssetPlan(stored?.content);
    expect(decoded).not.toBeNull();
    expect(
      decoded?.assets.find((a) => a.id === "anim_idle")?.references,
    ).toEqual(["model_player"]);
  });

  it("carries the plan to Studio without claiming any asset was materialized", async () => {
    const store = new ArtifactStore();
    await record(store, "exec-studio", agentOutput());

    const snapshot = new ProjectSyncManager(store).getProjectSnapshotForProject(
      PROJECT,
      "exec-studio",
    );
    const asset = snapshot?.artifacts.find((a) => a.stage === "ASSET_PLANNING");

    expect(asset).toBeDefined();
    expect(asset?.type).toBe("asset-plan");
    // A plan, not an upload: nothing anywhere records an asset id, a Roblox
    // content URL, or an upload receipt. That is ASSET-FABRIC-2's work.
    const serialized = JSON.stringify(asset);
    expect(serialized).not.toMatch(
      /rbxassetid|uploaded|materialized|contentUrl/i,
    );
  });
});
