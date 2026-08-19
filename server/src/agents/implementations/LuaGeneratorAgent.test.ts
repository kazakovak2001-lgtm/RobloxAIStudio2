import { describe, expect, it, vi } from "vitest";
import { normalizeLuaArtifactContent } from "../../studio/artifacts/GenerationArtifactRecorder";
import {
  getPlayableLuaIssues,
  normalizeLuaScripts,
} from "../../types/playableLua";
import {
  LuaGeneratorAgent,
  extractServiceNames,
  normalizeBacktickLuaCode,
} from "./LuaGeneratorAgent";

const input = {
  blueprint: {
    name: "Crystal Quest",
    description: "Collect crystals, show score, and finish the objective.",
  },
  architecture: {
    services: ["WorldService", { name: "CollectibleService" }],
  },
  gameplay: { mechanics: [{ name: "Crystal collection" }] },
};

describe("LuaGeneratorAgent playable runtime contract", () => {
  it("extracts named architecture services instead of array indexes", () => {
    expect(
      extractServiceNames(["WorldService", { name: "ScoreService" }]),
    ).toEqual(["WorldService", "ScoreService"]);
    expect(
      extractServiceNames({ data: { durable: true }, ui: "HUDService" }),
    ).toEqual(["data", "HUDService"]);
  });

  it("provides a playable deterministic vertical slice in stub mode", async () => {
    const result = await new LuaGeneratorAgent().execute(input);

    expect(result.success).toBe(true);
    expect(() =>
      normalizeLuaArtifactContent(result.data as Record<string, unknown>),
    ).not.toThrow();
    expect(JSON.stringify(result.data)).toContain("GeneratedAdventure");
    expect(JSON.stringify(result.data)).toContain("ScreenGui");
  });

  it("repairs a placeholder response with the project brief and named services", async () => {
    const playable = await new LuaGeneratorAgent().execute(input);
    const generate = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          lua_generator: {
            server: [
              { name: "World.server.lua", code: "-- TODO implement here" },
            ],
            client: [{ name: "HUD.client.lua", code: "-- placeholder" }],
            shared: [],
          },
        }),
      )
      .mockResolvedValueOnce(JSON.stringify(playable.data));
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    const result = await agent.execute(input);

    expect(result.success).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]?.[0]).toContain("Collect crystals");
    // FP-1C: architecture component names are presented as logical components,
    // not as a bare service list. Models were reading a bare list as Roblox
    // services and emitting game:GetService("WorldService").
    expect(generate.mock.calls[0]?.[0]).toContain(
      'logical component "WorldService"',
    );
    expect(generate.mock.calls[0]?.[0]).toContain(
      'logical component "CollectibleService"',
    );
    expect(generate.mock.calls[0]?.[0]).toContain(
      "never pass any of these names to game:GetService()",
    );
    expect(generate.mock.calls[0]?.[0]).not.toContain("Architecture: 0, 1");
    expect(generate.mock.calls[1]?.[0]).toContain("REPAIR REQUIRED");
  });

  it("uses a labeled safe repair when every valid AI response is unplayable", async () => {
    const invalid = JSON.stringify({
      lua_generator: {
        server: [
          { name: "World.server.lua", code: "-- Initialize world here" },
        ],
        client: [{ name: "HUD.client.lua", code: "-- TODO" }],
        shared: [],
      },
    });
    const generate = vi.fn().mockResolvedValue(invalid);
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    const result = await agent.execute(input);

    expect(result.success).toBe(true);
    const generated = (result.data as Record<string, unknown>)
      .lua_generator as Record<string, unknown>;
    expect(generated.generationMode).toBe("safe_repair");
    expect(generated.repairReason).toContain("Lua generation is not playable");
    expect(JSON.stringify(generated)).toContain("GeneratedAdventure");
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("uses a constrained final repair for structurally valid but unplayable Ollama output", async () => {
    const playable = await new LuaGeneratorAgent().execute(input);
    const initial = JSON.stringify({
      lua_generator: {
        server: [
          {
            name: "GameSetup.server.lua",
            code: "game.Players.PlayerAdded:Connect(function(player) print(player.Name) end)",
          },
        ],
        client: [
          {
            name: "HUD.client.lua",
            code: "local gui = Instance.new('ScreenGui', game.Players.LocalPlayer.PlayerGui)",
          },
        ],
        shared: [],
      },
    });
    const invalidRepair = JSON.stringify({
      lua_generator: {
        server: [
          {
            name: "WorldInitializer.server.lua",
            code: "game.Workspace:InsertService('StarterPlayer')\nlocal collectible = Instance.new('Part')\ncollectible.Parent = game.Workspace\ncollectible.Touched:Connect(function(hit) print(hit.Name) end)",
          },
        ],
        client: [
          {
            name: "HUD.client.lua",
            code: "local playerGui = game.Players.LocalPlayer:WaitForChild('PlayerGui')\nlocal gui = Instance.new('ScreenGui')\ngui.Parent = playerGui\nlocal label = Instance.new('TextLabel')\nlabel.Text = 'Score: 0'\nlabel.Parent = gui",
          },
        ],
        shared: [],
      },
    });
    const generate = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(invalidRepair)
      .mockResolvedValueOnce(JSON.stringify(playable.data));
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    const result = await agent.execute(input);

    expect(result.success).toBe(true);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate.mock.calls[2]?.[0]).toContain("gui.Parent = playerGui");
    expect(generate.mock.calls[2]?.[0]).toContain(
      "collectible.Touched:Connect",
    );
    expect(generate.mock.calls[2]?.[0]).toContain(
      "runtime code must not call the invalid InsertService API",
    );
    expect(generate.mock.calls[2]?.[0]).toContain(
      "event.OnClientEvent:Connect",
    );
  });

  it("rejects disconnected scripts that only pass aggregate token checks", () => {
    const scripts = normalizeLuaScripts({
      lua_generator: {
        server: [
          {
            name: "World.server.lua",
            code: "local world = Instance.new('Folder')\nworld.Parent = workspace\nlocal collectible = Instance.new('Part')\ncollectible.Parent = world\ncollectible.Touched:Connect(function(hit) print(hit.Name) end)",
          },
          {
            name: "Progress.server.lua",
            code: "local event = Instance.new('RemoteEvent')\nevent.Parent = game:GetService('ReplicatedStorage')\nevent:FireAllClients(1, 1)\nlocal GamePassService = game:GetService('GamePassService')",
          },
          {
            name: "ModuleAsScript.server.lua",
            code: "return { start = function() print('never executed as a module') end }",
          },
        ],
        client: [
          {
            name: "Hud.client.lua",
            code: "local playerGui = game.Players.LocalPlayer:WaitForChild('PlayerGui')\nlocal gui = Instance.new('ScreenGui')\ngui.Parent = playerGui\nlocal label = Instance.new('TextLabel')\nlabel.Parent = gui",
          },
          {
            name: "Progress.client.lua",
            code: "game:GetService('ReplicatedStorage'):WaitForChild('Progress').OnClientEvent:Connect(function(score) print(score) end)",
          },
        ],
        shared: [],
      },
    });

    expect(getPlayableLuaIssues(scripts)).toEqual(
      expect.arrayContaining([
        "server code must not request the nonexistent GamePassService",
        "server Scripts must not return ModuleScript tables",
        "one server Script must own the complete world, objective, and progress event",
        "one client LocalScript must create the HUD before observing progress",
      ]),
    );
  });

  it("never substitutes the generic stub game for malformed LLM JSON", async () => {
    const generate = vi.fn().mockResolvedValue('{ "lua_generator":');
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    const result = await agent.execute(input);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not a valid JSON object");
    expect(JSON.stringify(result.data ?? {})).not.toContain(
      "GeneratedAdventure",
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("normalizes unambiguous backtick-delimited Lua code from local models", () => {
    const raw =
      '```json\n{"lua_generator":{"server":[{"name":"Game.server.lua","code": `local world = Instance.new("Folder")\nworld.Parent = workspace`}],"client":[],"shared":[]}}\n```';

    const normalized = normalizeBacktickLuaCode(raw);

    expect(normalized).not.toBeNull();
    expect(normalized).toContain(
      '"code": "local world = Instance.new(\\"Folder\\")\\nworld.Parent = workspace"',
    );
  });

  it("rejects an unterminated backtick-delimited code value", () => {
    expect(
      normalizeBacktickLuaCode(
        '{"lua_generator":{"server":[{"code": `print("broken")}]}}',
      ),
    ).toBeNull();
  });

  it("accepts path/content entries through the shared Studio normalizer", async () => {
    const fallback = await new LuaGeneratorAgent().execute(input);
    const normalized = normalizeLuaArtifactContent(fallback.data) as {
      scripts: Array<{ path: string; content: string }>;
    };
    const byRoot = (root: string) =>
      normalized.scripts
        .filter((script) => script.path.startsWith(root))
        .map((script) => ({ path: script.path, content: script.content }));
    const generate = vi.fn().mockResolvedValue(
      JSON.stringify({
        lua_generator: {
          server: byRoot("ServerScriptService/"),
          client: byRoot("StarterPlayerScripts/"),
          shared: byRoot("ReplicatedStorage/Shared/"),
        },
      }),
    );
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    const result = await agent.execute(input);

    expect(result.success).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

/**
 * GEN-CANONICAL-FIDELITY-1. LuaGeneratorAgent still had an independent
 * generic "collect 5 orbs" fallback/prompt disconnected from the design's
 * mechanics, progression and economy — the real
 * `POST /:projectId/generate` path could ignore the richer gameplay
 * behaviour GEN-FIDELITY-1/2 built for the legacy generator entirely. These
 * fixtures prove blueprint/gameplay mechanics, progression and economy
 * survive into both the canonical prompt and the deterministic fallback,
 * that multiple objectives are required and server-authoritative when the
 * design provides them, and that none of this depends on or introduces
 * `server/src/generation/lua/LuaGenerator.ts` (the legacy generator).
 */
describe("GEN-CANONICAL-FIDELITY-1 — rich blueprint/gameplay survives into canonical output", () => {
  const richInput = {
    blueprint: {
      name: "Ember Reach",
      description: "Mine, craft and trade your way across the reach.",
    },
    architecture: {
      services: ["WorldService", { name: "EconomyService" }],
    },
    gameplay: {
      mechanics: [
        { name: "mining", description: "Dig ore from deposits" },
        { name: "crafting", description: "Turn ore into gear" },
        { name: "trading", description: "Sell gear at the outpost" },
      ],
      progression: {
        loop: "explore → gather → craft → trade",
        unlocking_system: "reputation thresholds",
      },
      balance: {
        economyOrScoring: "gems earned per completed trade route",
      },
    },
  };

  it("stub mode (no LLM): fallback builds one objective per mechanic, not always 5 orbs", async () => {
    const result = await new LuaGeneratorAgent().execute(richInput);

    expect(result.success).toBe(true);
    const generated = (result.data as Record<string, unknown>)
      .lua_generator as Record<string, unknown>;
    const server = (generated.server as Array<{ code: string }>)[0].code;
    const client = (generated.client as Array<{ code: string }>)[0].code;

    for (const mechanic of ["mining", "crafting", "trading"]) {
      expect(server).toContain(`${mechanic}_Interactable`);
    }
    // Not the old fixed "collect 5 golden orbs" stub.
    expect(server).not.toContain("golden orbs");
    expect(client).not.toContain("golden orbs");

    // Server-authoritative, ordered, single state owner.
    expect(server).toContain("local PlayerState = {}");
    expect(server).toContain("if objectiveIndex ~= state.progress then");
    expect(server).toContain(
      "state.currency = state.currency + objective.reward",
    );
    expect(server).toContain("Players.PlayerRemoving:Connect(function(player)");
    expect(server).toContain("PlayerState[player.UserId] = nil");

    // HUD reflects the authoritative payload, not a mechanic name alone.
    expect(client).toContain("data.completed");
    expect(client).toContain("data.completedCount");
    expect(client).toContain("data.totalObjectives");
    expect(client).toContain("data.nextObjective");
    expect(client).toContain("data.currency");

    expect(getPlayableLuaIssues(normalizeLuaScripts(result.data))).toEqual([]);
  });

  it("preserves mechanics, progression and economy in the canonical prompt sent to the LLM", async () => {
    const playable = await new LuaGeneratorAgent().execute(richInput);
    const generate = vi.fn().mockResolvedValue(JSON.stringify(playable.data));
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    const result = await agent.execute(richInput);

    expect(result.success).toBe(true);
    const prompt = generate.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("mining");
    expect(prompt).toContain("crafting");
    expect(prompt).toContain("trading");
    expect(prompt).toContain("explore → gather → craft → trade");
    expect(prompt).toContain("reputation thresholds");
    expect(prompt).toContain("gems earned per completed trade route");
    // The multi-objective / ordering / authoritative-state requirement, not
    // just the raw field values.
    expect(prompt).toContain("this design names 3 mechanics");
    expect(prompt).toContain(
      "Gate completion server-side and in this exact order",
    );
    expect(prompt).toContain(
      "Track each player's progress and reward balance in one authoritative server-side table",
    );
  });

  it("the final deterministic safe-repair fallback also preserves rich gameplay, not a generic stub", async () => {
    const invalid = JSON.stringify({
      lua_generator: {
        server: [
          { name: "World.server.lua", code: "-- Initialize world here" },
        ],
        client: [{ name: "HUD.client.lua", code: "-- TODO" }],
        shared: [],
      },
    });
    const generate = vi.fn().mockResolvedValue(invalid);
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    const result = await agent.execute(richInput);

    expect(result.success).toBe(true);
    const generated = (result.data as Record<string, unknown>)
      .lua_generator as Record<string, unknown>;
    expect(generated.generationMode).toBe("safe_repair");
    const server = (generated.server as Array<{ code: string }>)[0].code;
    for (const mechanic of ["mining", "crafting", "trading"]) {
      expect(server).toContain(`${mechanic}_Interactable`);
    }
    expect(server).not.toContain("golden orbs");
  });

  it("a design naming no mechanics still falls back to a single generic, playable objective", async () => {
    const bare = {
      blueprint: { name: "Bare Game", description: "No mechanics named." },
      architecture: { services: [] },
      gameplay: {},
    };

    const result = await new LuaGeneratorAgent().execute(bare);

    expect(result.success).toBe(true);
    const generated = (result.data as Record<string, unknown>)
      .lua_generator as Record<string, unknown>;
    const server = (generated.server as Array<{ code: string }>)[0].code;
    expect(server).toContain("objective_Interactable");
    expect(getPlayableLuaIssues(normalizeLuaScripts(result.data))).toEqual([]);
  });

  it("does not import or depend on the legacy deterministic LuaGenerator", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./LuaGeneratorAgent.ts", import.meta.url), "utf8"),
    );
    // No actual import statement resolves to the legacy generator module —
    // a mention inside a comment (explaining that it is deliberately not
    // used) is fine; an `import ... from` naming that path is not.
    expect(source).not.toMatch(
      /from\s+["'][^"']*generation\/lua\/LuaGenerator["']/,
    );
  });
});

/**
 * GEN-CANONICAL-FIDELITY-1 (DO #6). One narrow test that the real canonical
 * chain — PlannerEngine → PlanExecutor → AgentRegistry's registered
 * LuaGeneratorAgent — actually reaches this agent and carries mechanics
 * through to it, using the same wiring `GameGenerationService.enqueueGeneration`
 * uses (`agentRegistry.executeAgent(agent, { ...input, blueprint })`), the
 * same default `GAME_GENERATION_PIPELINE`, and the real `AgentRegistry` (so
 * "lua_generator" resolves to the actual registered `LuaGeneratorAgent`, not
 * a stand-in). No LLM is configured, so every agent runs its own
 * deterministic fallback — this is the wiring proof, not a model-quality
 * test.
 */
describe("GEN-CANONICAL-FIDELITY-1 — real GameGenerationService/PlanExecutor path", () => {
  it("reaches the registered LuaGeneratorAgent and carries mechanics through", async () => {
    const { PlannerEngine } = await import("../../planning/core/PlannerEngine");
    const { PlanExecutor } =
      await import("../../planning/execution/PlanExecutor");
    const { AgentRegistry } = await import("../core/AgentRegistry");

    const blueprint = {
      name: "Canonical Path Game",
      description: "Prove the real pipeline reaches LuaGeneratorAgent.",
      gameplay: {
        mechanics: [
          { name: "scouting" },
          { name: "building" },
          { name: "defending" },
        ],
      },
    };

    const planner = new PlannerEngine();
    const plan = planner.createPlan({
      intent: "Generate game: Canonical Path Game",
      constraints: [],
      projectId: "proj-gen-canonical-fidelity-1",
      requiredAgents: [
        "requirements",
        "planner",
        "game_designer",
        "roblox_architect",
        "lua_generator",
      ],
    });

    const agentRegistry = new AgentRegistry();
    const executor = new PlanExecutor();

    // The exact wrapper GameGenerationService.enqueueGeneration uses: every
    // agent call gets the frozen blueprint injected on top of whatever the
    // executor accumulated from completed dependencies.
    const result = await executor.executePlan(
      "exec-gen-canonical-fidelity-1",
      plan.graph,
      (agent, agentInput) =>
        agentRegistry.executeAgent(agent, { ...agentInput, blueprint }),
      { projectId: blueprint.name, stopOnFailure: false },
    );

    expect(result.success).toBe(true);

    const luaNode = result.graph
      .getAllNodes()
      .find((node) => node.agent === "lua_generator");
    expect(luaNode?.status).toBe("done");

    const luaOutput = luaNode?.output as Record<string, unknown>;
    const generated = luaOutput.lua_generator as Record<string, unknown>;
    const server = (generated.server as Array<{ code: string }>)[0].code;

    for (const mechanic of ["scouting", "building", "defending"]) {
      expect(server).toContain(`${mechanic}_Interactable`);
    }
    expect(getPlayableLuaIssues(normalizeLuaScripts(luaOutput))).toEqual([]);
  });
});
