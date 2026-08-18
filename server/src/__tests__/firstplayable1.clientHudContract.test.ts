/**
 * FIRST-PLAYABLE-1 (FP-1C). Client HUD contract: behaviour, not idiom.
 *
 * The validator previously required a local literally named `playerGui`, so it
 * rejected `gui.Parent = Players.LocalPlayer.PlayerGui` — code that is correct
 * Roblox Luau and satisfies the actual invariant. These tests pin the invariant
 * itself:
 *
 *   - a ScreenGui is created
 *   - it is parented to the local player's PlayerGui
 *   - the HUD exists before OnClientEvent is subscribed
 *   - OnClientEvent updates already-created HUD
 *
 * The Luau here is a contract probe, not a game: generic names, no theme, no
 * acceptance-game content.
 */

import { describe, expect, it } from "vitest";
import { getPlayableLuaIssues } from "../types/playableLua";

const HUD_ISSUE =
  "one client LocalScript must create the HUD before observing progress";

/** A server script that satisfies every server-side rule, so only the client varies. */
const SERVER_SOURCE = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progressEvent = Instance.new("RemoteEvent")
progressEvent.Name = "ProgressEvent"
progressEvent.Parent = ReplicatedStorage

local world = Instance.new("Folder")
world.Name = "GeneratedWorld"
world.Parent = workspace

local target = Instance.new("Part")
target.Anchored = true
target.Size = Vector3.new(4, 4, 4)
target.Position = Vector3.new(0, 8, 0)
target.Material = Enum.Material.Neon
target.Parent = world

local score = 0
target.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if player then
    score = score + 1
    progressEvent:FireClient(player, score)
  end
end)
`;

function issuesForClient(clientSource: string): string[] {
  return getPlayableLuaIssues([
    { path: "ServerScriptService/World.server.lua", content: SERVER_SOURCE },
    { path: "StarterPlayerScripts/Hud.client.lua", content: clientSource },
  ]);
}

describe("FP-1C client HUD contract accepts equivalent valid parenting forms", () => {
  it("accepts the intermediate-local idiom", () => {
    const client = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Size = UDim2.new(0.3, 0, 0.1, 0)
label.Text = "Progress: 0"
label.Parent = gui

ReplicatedStorage.ProgressEvent.OnClientEvent:Connect(function(score)
  label.Text = "Progress: " .. tostring(score)
end)
`;
    expect(issuesForClient(client)).not.toContain(HUD_ISSUE);
  });

  it("accepts direct dot-access parenting without an intermediate local", () => {
    const client = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local gui = Instance.new("ScreenGui")
gui.Parent = Players.LocalPlayer.PlayerGui

local label = Instance.new("TextLabel")
label.Size = UDim2.new(0.3, 0, 0.1, 0)
label.Text = "Progress: 0"
label.Parent = gui

ReplicatedStorage.ProgressEvent.OnClientEvent:Connect(function(score)
  label.Text = "Progress: " .. tostring(score)
end)
`;
    expect(issuesForClient(client)).not.toContain(HUD_ISSUE);
  });

  it("accepts inline WaitForChild parenting", () => {
    const client = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local gui = Instance.new("ScreenGui")
gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")

local label = Instance.new("TextLabel")
label.Size = UDim2.new(0.3, 0, 0.1, 0)
label.Parent = gui

ReplicatedStorage.ProgressEvent.OnClientEvent:Connect(function(score)
  label.Text = "Progress: " .. tostring(score)
end)
`;
    expect(issuesForClient(client)).not.toContain(HUD_ISSUE);
  });

  it("accepts a differently named local bound to PlayerGui", () => {
    const client = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local screenParent = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Parent = screenParent

local label = Instance.new("TextLabel")
label.Size = UDim2.new(0.3, 0, 0.1, 0)
label.Parent = gui

ReplicatedStorage.ProgressEvent.OnClientEvent:Connect(function(score)
  label.Text = "Progress: " .. tostring(score)
end)
`;
    expect(issuesForClient(client)).not.toContain(HUD_ISSUE);
  });
});

describe("FP-1C client HUD contract still rejects genuinely broken HUDs", () => {
  it("rejects a HUD created inside the OnClientEvent callback", () => {
    const client = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

ReplicatedStorage.ProgressEvent.OnClientEvent:Connect(function(score)
  local gui = Instance.new("ScreenGui")
  gui.Parent = Players.LocalPlayer.PlayerGui
  local label = Instance.new("TextLabel")
  label.Parent = gui
  label.Text = "Progress: " .. tostring(score)
end)
`;
    expect(issuesForClient(client)).toContain(HUD_ISSUE);
  });

  it("rejects a ScreenGui that is never parented to PlayerGui", () => {
    const client = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local gui = Instance.new("ScreenGui")
gui.Parent = workspace

local label = Instance.new("TextLabel")
label.Parent = gui

ReplicatedStorage.ProgressEvent.OnClientEvent:Connect(function(score)
  label.Text = "Progress: " .. tostring(score)
end)
`;
    expect(issuesForClient(client)).toContain(HUD_ISSUE);
  });

  it("rejects a client with no ScreenGui at all", () => {
    const client = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local label = Instance.new("TextLabel")
label.Parent = Players.LocalPlayer.PlayerGui

ReplicatedStorage.ProgressEvent.OnClientEvent:Connect(function(score)
  label.Text = "Progress: " .. tostring(score)
end)
`;
    expect(issuesForClient(client)).toContain(HUD_ISSUE);
  });

  it("rejects a HUD that never subscribes to progress", () => {
    const client = `
local Players = game:GetService("Players")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Text = "Progress: 0"
label.Parent = gui
`;
    expect(issuesForClient(client)).toContain(HUD_ISSUE);
  });
});
