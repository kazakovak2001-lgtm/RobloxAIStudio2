/**
 * FP-1C. Execution-side invariants for generated Luau.
 *
 * A real generated artifact passed `getPlayableLuaIssues() === []` while its
 * server Script called `game.Players.LocalPlayer` and subscribed with
 * `OnClientEvent`. Both are client-only: `LocalPlayer` is nil on the server and
 * `OnClientEvent` does not exist there, so the package would have errored at
 * Play. The validator classified scripts by path but never checked whether the
 * code belonged on that side.
 *
 * Assertions are by role and behaviour, never by a specific variable name.
 */

import { describe, expect, it } from "vitest";
import { getPlayableLuaIssues } from "../types/playableLua";

const SERVER_PATH = "ServerScriptService/World.server.lua";
const CLIENT_PATH = "StarterPlayerScripts/Hud.client.lua";

/** A server body that satisfies every pre-existing check. */
const GOOD_SERVER = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local event = Instance.new("RemoteEvent")
event.Name = "ProgressEvent"
event.Parent = ReplicatedStorage

local world = Instance.new("Folder")
world.Name = "GeneratedWorld"
world.Parent = workspace

local spawnPoint = Instance.new("SpawnLocation")
spawnPoint.Anchored = true
spawnPoint.Position = Vector3.new(0, 5, 0)
spawnPoint.Parent = world

local target = Instance.new("Part")
target.Anchored = true
target.Size = Vector3.new(4, 4, 4)
target.Material = Enum.Material.Neon
target.Parent = world

local score = 0
target.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if player then
    score = score + 1
    event:FireClient(player, score)
  end
end)
`;

const GOOD_CLIENT = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Size = UDim2.new(0.3, 0, 0.1, 0)
label.Text = "Progress: 0"
label.Parent = gui

ReplicatedStorage.ProgressEvent.OnClientEvent:Connect(function(value)
  label.Text = "Progress: " .. tostring(value)
end)
`;

const issuesFor = (server: string, client: string): string[] =>
  getPlayableLuaIssues([
    { path: SERVER_PATH, content: server },
    { path: CLIENT_PATH, content: client },
  ]);

const serverIssues = (server: string) =>
  issuesFor(server, GOOD_CLIENT).filter((i) => i.startsWith(SERVER_PATH));
const clientIssues = (client: string) =>
  issuesFor(GOOD_SERVER, client).filter((i) => i.startsWith(CLIENT_PATH));

describe("valid server and client code is still accepted", () => {
  it("accepts the canonical playable pair with no issues at all", () => {
    expect(issuesFor(GOOD_SERVER, GOOD_CLIENT)).toEqual([]);
  });

  it("accepts FireClient with a real Player on the server", () => {
    expect(serverIssues(GOOD_SERVER)).toEqual([]);
  });

  it("accepts FireAllClients on the server", () => {
    const server = GOOD_SERVER.replace(
      "event:FireClient(player, score)",
      "event:FireAllClients(score)",
    );
    expect(serverIssues(server)).toEqual([]);
  });

  it.each([
    ["ProximityPrompt.Triggered", "prompt.Triggered:Connect(function(player)"],
    [
      "ClickDetector.MouseClick",
      "detector.MouseClick:Connect(function(player)",
    ],
    ["Tool.Activated", "tool.Activated:Connect(function(player)"],
  ])("accepts %s as the interaction mechanism", (_label, connect) => {
    const server = GOOD_SERVER.replace(
      "target.Touched:Connect(function(hit)",
      connect,
    ).replace("local player = Players:GetPlayerFromCharacter(hit.Parent)", "");
    expect(serverIssues(server)).toEqual([]);
  });

  it("accepts LocalPlayer, PlayerGui and OnClientEvent on the client", () => {
    expect(clientIssues(GOOD_CLIENT)).toEqual([]);
  });

  it("does not flag a client that names FireClient only inside a comment", () => {
    const client = `-- never call FireClient here\n${GOOD_CLIENT}`;
    expect(clientIssues(client)).toEqual([]);
  });

  it("does not flag a server that names LocalPlayer only inside a comment", () => {
    const server = `-- LocalPlayer is not available here\n${GOOD_SERVER}`;
    expect(serverIssues(server)).toEqual([]);
  });
});

describe("server Scripts reject client-only semantics", () => {
  it.each([
    ["Players.LocalPlayer", "local p = Players.LocalPlayer"],
    ["game.Players.LocalPlayer", "local p = game.Players.LocalPlayer"],
    [
      "LocalPlayer.PlayerGui",
      "local g = game.Players.LocalPlayer.PlayerGui:FindFirstChild('X')",
    ],
    [
      "FireClient(Players.LocalPlayer, ...)",
      "event:FireClient(Players.LocalPlayer, 1)",
    ],
    [
      "FireClient(game.Players.LocalPlayer, ...)",
      "event:FireClient(game.Players.LocalPlayer, 1)",
    ],
  ])("rejects %s in a server Script", (_label, line) => {
    expect(serverIssues(`${GOOD_SERVER}\n${line}\n`)).toContainEqual(
      expect.stringContaining("must not use LocalPlayer"),
    );
  });

  it("rejects OnClientEvent in a server Script", () => {
    const server = `${GOOD_SERVER}\nevent.OnClientEvent:Connect(function() end)\n`;
    expect(serverIssues(server)).toContainEqual(
      expect.stringContaining("must not subscribe with OnClientEvent"),
    );
  });
});

describe("client LocalScripts reject server-only semantics", () => {
  it("rejects FireClient on the client", () => {
    const client = `${GOOD_CLIENT}\nReplicatedStorage.ProgressEvent:FireClient(Players.LocalPlayer, 1)\n`;
    expect(clientIssues(client)).toContainEqual(
      expect.stringContaining("must not call FireClient or FireAllClients"),
    );
  });

  it("rejects FireAllClients on the client", () => {
    const client = `${GOOD_CLIENT}\nReplicatedStorage.ProgressEvent:FireAllClients(1)\n`;
    expect(clientIssues(client)).toContainEqual(
      expect.stringContaining("must not call FireClient or FireAllClients"),
    );
  });
});

describe("regression: the actual FP-1C generated failure class", () => {
  it("rejects a server Script that builds a real world but uses client-only APIs", () => {
    // Shaped after the generated artifact: real terrain, real interaction, a
    // real RemoteEvent — and client-only calls smuggled into the server.
    const server = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

workspace.Terrain:Clear()
workspace.Terrain:FillBlock(CFrame.new(0, 0, 0), Vector3.new(200, 8, 200), Enum.Material.Ground)

local event = Instance.new("RemoteEvent")
event.Name = "Progress"
event.Parent = ReplicatedStorage

local spawnPoint = Instance.new("SpawnLocation")
spawnPoint.Anchored = true
spawnPoint.Parent = workspace

local target = Instance.new("Part")
target.Anchored = true
target.Material = Enum.Material.Neon
target.Parent = workspace

local score = Instance.new("IntValue")
target.Touched:Connect(function(hit)
  score.Value = score.Value + 1
  event:FireClient(game.Players.LocalPlayer, score.Value)
end)

local function onClientEvent(value)
  local label = game.Players.LocalPlayer.PlayerGui:FindFirstChild('ProgressLabel')
  if label then label.Text = tostring(value) end
end
game:GetService('ReplicatedStorage').Progress.OnClientEvent:Connect(onClientEvent)
`;
    const found = issuesFor(server, GOOD_CLIENT);
    expect(found).toContainEqual(
      expect.stringContaining("must not use LocalPlayer"),
    );
    expect(found).toContainEqual(
      expect.stringContaining("must not subscribe with OnClientEvent"),
    );
    // The point of the regression: this shape used to return zero issues.
    expect(found).not.toEqual([]);
  });
});

describe("shared ModuleScripts are execution-neutral", () => {
  const SHARED_PATH = "ReplicatedStorage/Shared/Util.lua";
  const withShared = (content: string): string[] =>
    getPlayableLuaIssues([
      { path: SERVER_PATH, content: GOOD_SERVER },
      { path: CLIENT_PATH, content: GOOD_CLIENT },
      { path: SHARED_PATH, content },
    ]).filter((i) => i.startsWith(SHARED_PATH));

  it("accepts a module that exports pure functions and data", () => {
    expect(
      withShared(`
local Config = {}
Config.MaxScore = 10
function Config.format(value)
  return "Progress: " .. tostring(value)
end
return Config
`),
    ).toEqual([]);
  });

  it.each([
    ["LocalPlayer", "local p = game.Players.LocalPlayer"],
    ["PlayerGui", "local g = player.PlayerGui"],
    ["OnClientEvent", "event.OnClientEvent:Connect(function() end)"],
    ["FireClient", "event:FireClient(player, 1)"],
    ["FireAllClients", "event:FireAllClients(1)"],
  ])("rejects %s inside a shared module", (label, line) => {
    const issues = withShared(`local M = {}\n${line}\nreturn M\n`);
    expect(issues).toContainEqual(
      expect.stringContaining("must not use side-specific APIs"),
    );
    expect(issues[0]).toContain(label);
  });

  it("names every offending API it found", () => {
    const issues = withShared(`
local M = {}
local p = game.Players.LocalPlayer
event.OnClientEvent:Connect(function() end)
return M
`);
    expect(issues[0]).toContain("LocalPlayer");
    expect(issues[0]).toContain("OnClientEvent");
  });

  it("does not flag side-specific names in comments or strings", () => {
    expect(
      withShared(`
local M = {}
-- the client script owns LocalPlayer and OnClientEvent
M.hint = "call FireClient from the server"
return M
`),
    ).toEqual([]);
  });

  it("regression: the generated shared module is now rejected", () => {
    // Shaped after the run-9 artifact's SharedService.lua.
    const issues = withShared(`
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local function onClientEvent(value)
  print(value)
end
ReplicatedStorage.Progress.OnClientEvent:Connect(onClientEvent)
`);
    expect(issues).not.toEqual([]);
    expect(issues[0]).toContain("OnClientEvent");
  });
});
