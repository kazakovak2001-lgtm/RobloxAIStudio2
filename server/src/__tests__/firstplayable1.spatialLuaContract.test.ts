/**
 * FIRST-PLAYABLE-1 (FP-1C). Does the existing playability contract accept Lua
 * that builds a designed world?
 *
 * SCOPE, STATED PLAINLY: this file does **not** prove that AI generation
 * works. No provider is exercised here. What it proves is the question that
 * can be answered without one — whether `LuaGeneratorAgent`'s real
 * post-generation path (normalisation, playability validation, artifact
 * shaping) accepts spatial world-building Luau, or whether the existing
 * contract would reject it and block FP-1 regardless of what a model returns.
 *
 * The Luau below is a **contract probe**, not a game and not the acceptance
 * game: generic names, no theme, no collectible-specific behaviour. It exists
 * to be fed to the validator, and nothing in production reads it.
 */

import { describe, expect, it, vi } from "vitest";
import { LuaGeneratorAgent } from "../agents/implementations/LuaGeneratorAgent";
import {
  getPlayableLuaIssues,
  normalizeLuaScripts,
} from "../types/playableLua";

/**
 * Server Luau of the shape the FP-1B prompt asks for: clear terrain, fill
 * several regions at different elevations, spawn, oriented anchored parts
 * under a named folder, and an objective wired to an interactive object.
 */
const SPATIAL_SERVER_LUA = `
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local terrain = Workspace.Terrain
terrain:Clear()
terrain:FillBlock(CFrame.new(0, 0, 0), Vector3.new(256, 16, 256), Enum.Material.Grass)
terrain:FillBlock(CFrame.new(120, 12, 90), Vector3.new(64, 40, 64), Enum.Material.Rock)
terrain:FillBall(Vector3.new(-70, 6, 40), 30, Enum.Material.Sand)
terrain:FillCylinder(CFrame.new(40, 4, -60), 18, 22, Enum.Material.Slate)

local worldFolder = Instance.new("Folder")
worldFolder.Name = "GeneratedWorld"
worldFolder.Parent = Workspace

local spawnPoint = Instance.new("SpawnLocation")
spawnPoint.Name = "PrimarySpawn"
spawnPoint.Size = Vector3.new(12, 1, 12)
spawnPoint.CFrame = CFrame.new(0, 18, 0)
spawnPoint.Anchored = true
spawnPoint.Parent = worldFolder

local platform = Instance.new("Part")
platform.Name = "Platform01"
platform.Size = Vector3.new(24, 1, 8)
platform.CFrame = CFrame.new(48, 22, 16) * CFrame.Angles(0, math.rad(35), 0)
platform.Material = Enum.Material.WoodPlanks
platform.Anchored = true
platform.Parent = worldFolder

local span = Instance.new("Part")
span.Name = "Span01"
span.Size = Vector3.new(6, 1, 60)
span.CFrame = CFrame.new(90, 26, 60)
span.Material = Enum.Material.Wood
span.Anchored = true
span.Parent = worldFolder

local decor = Instance.new("Part")
decor.Name = "Decor01"
decor.Size = Vector3.new(4, 14, 4)
decor.CFrame = CFrame.new(-30, 20, 25)
decor.Material = Enum.Material.Grass
decor.Anchored = true
decor.Parent = worldFolder

local progressEvent = Instance.new("RemoteEvent")
progressEvent.Name = "ProgressEvent"
progressEvent.Parent = ReplicatedStorage

local target = 3
local collected = 0

local pickup = Instance.new("Part")
pickup.Name = "Interactive01"
pickup.Size = Vector3.new(2, 2, 2)
pickup.CFrame = CFrame.new(24, 21, 8)
pickup.Material = Enum.Material.Neon
pickup.Anchored = true
pickup.Parent = worldFolder

pickup.Touched:Connect(function(hit)
	local character = hit.Parent
	local player = game:GetService("Players"):GetPlayerFromCharacter(character)
	if not player then
		return
	end
	if not pickup.Parent then
		return
	end
	pickup:Destroy()
	collected = collected + 1
	progressEvent:FireClient(player, collected, target)
end)
`;

const SPATIAL_CLIENT_LUA = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "ProgressHud"
gui.ResetOnSpawn = false
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Name = "ProgressLabel"
label.Size = UDim2.new(0, 260, 0, 48)
label.Position = UDim2.new(0, 16, 0, 16)
label.BackgroundTransparency = 0.35
label.TextScaled = true
label.Text = "Progress: 0"
label.Parent = gui

local progressEvent = ReplicatedStorage:WaitForChild("ProgressEvent")

progressEvent.OnClientEvent:Connect(function(collected, target)
	label.Text = string.format("Progress: %d / %d", collected, target)
end)
`;

const spatialResponse = JSON.stringify({
  lua_generator: {
    server: [{ name: "World.server.lua", code: SPATIAL_SERVER_LUA }],
    client: [{ name: "Hud.client.lua", code: SPATIAL_CLIENT_LUA }],
    shared: [],
  },
});

const agentInput = {
  blueprint: {
    name: "Contract Probe",
    description: "A generated game used to probe the playability contract.",
  },
  architecture: { services: ["WorldService"] },
  gameplay: { mechanics: [{ name: "Collection" }] },
};

describe("FP-1C the playability contract accepts a designed world", () => {
  it("raises no issues for spatial world-building Luau", () => {
    const scripts = normalizeLuaScripts({
      lua_generator: {
        server: [{ name: "World.server.lua", code: SPATIAL_SERVER_LUA }],
        client: [{ name: "Hud.client.lua", code: SPATIAL_CLIENT_LUA }],
        shared: [],
      },
    });

    // The whole FP-1 premise: terrain-built worlds are not rejected by the
    // contract that governs every generation, repair and delivery path.
    expect(getPlayableLuaIssues(scripts)).toEqual([]);
  });

  it("still rejects terrain that builds no playable instances", () => {
    // Guards the inverse: FP-1 must not have made the contract permissive.
    // Terrain alone is scenery, not a playable world.
    const terrainOnly = normalizeLuaScripts({
      lua_generator: {
        server: [
          {
            name: "World.server.lua",
            code: `
local Workspace = game:GetService("Workspace")
local terrain = Workspace.Terrain
terrain:Clear()
terrain:FillBlock(CFrame.new(0, 0, 0), Vector3.new(256, 16, 256), Enum.Material.Grass)
terrain:FillBall(Vector3.new(-70, 6, 40), 30, Enum.Material.Sand)
terrain:FillCylinder(CFrame.new(40, 4, -60), 18, 22, Enum.Material.Slate)
local unusedValue = 1 + 1
print("terrain built", unusedValue)
`,
          },
        ],
        client: [{ name: "Hud.client.lua", code: SPATIAL_CLIENT_LUA }],
        shared: [],
      },
    });

    const issues = getPlayableLuaIssues(terrainOnly);
    expect(issues).toContain(
      "server code must create playable world instances",
    );
    expect(issues).toContain(
      "server code must implement a gameplay interaction",
    );
  });
});

describe("FP-1C the agent's real path preserves the built world", () => {
  it("accepts the package and keeps every spatial construct intact", async () => {
    const generate = vi.fn().mockResolvedValue(spatialResponse);
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    // The agent's own normalisation + `assertPlayableLuaScripts` runs here.
    // If either rejected terrain-built Lua, this would throw or fall back.
    const result = await agent.execute(agentInput);

    const scripts = normalizeLuaScripts(result.data as Record<string, unknown>);
    const server = scripts.find((script) =>
      script.path.startsWith("ServerScriptService/"),
    );
    expect(server).toBeDefined();
    const source = server!.content;

    // Terrain survived the round trip, including elevation and every fill form.
    expect(source).toContain("Terrain");
    expect(source).toContain(":Clear()");
    expect(source).toContain("FillBlock");
    expect(source).toContain("FillBall");
    expect(source).toContain("FillCylinder");
    expect(source).toContain("Enum.Material.Grass");
    expect(source).toContain("Enum.Material.Rock");

    // Spawn, orientation, materials, anchoring and hierarchy survived.
    expect(source).toContain('Instance.new("SpawnLocation")');
    expect(source).toContain("CFrame.Angles");
    expect(source).toContain("Anchored = true");
    expect(source).toContain('Instance.new("Folder")');
    expect(source).toContain("Parent = worldFolder");

    // The result was not silently replaced by the deterministic fallback.
    expect(source).toContain("GeneratedWorld");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("carries no acceptance-specific content", async () => {
    const generate = vi.fn().mockResolvedValue(spatialResponse);
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });
    const result = await agent.execute(agentInput);

    const all = normalizeLuaScripts(result.data as Record<string, unknown>)
      .map((script) => script.content)
      .join("\n");

    // Nothing in the platform's accepted path is themed to the acceptance
    // prompt. If this ever matches, the test game leaked into production.
    expect(all).not.toMatch(/tropical|island|palm|coconut|coin/i);
  });
});
