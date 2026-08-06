import { describe, expect, it, vi } from "vitest";
import { normalizeLuaArtifactContent } from "../../studio/artifacts/GenerationArtifactRecorder";
import { LuaGeneratorAgent, extractServiceNames } from "./LuaGeneratorAgent";

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
    expect(generate.mock.calls[0]?.[0]).toContain(
      "WorldService, CollectibleService",
    );
    expect(generate.mock.calls[0]?.[0]).not.toContain("Architecture: 0, 1");
    expect(generate.mock.calls[1]?.[0]).toContain("REPAIR REQUIRED");
  });

  it("fails closed when the repaired response is still only scaffolding", async () => {
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

    expect(result.success).toBe(false);
    expect(result.error).toContain("Lua generation is not playable");
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
