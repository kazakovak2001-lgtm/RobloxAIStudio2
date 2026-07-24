--[[
  Roblox AI Studio Plugin — Entry Point

  Connects Roblox Studio to the DevKit backend and applies verified
  EXPORT_PROJECT commands produced by the canonical generation pipeline.

  Requirements:
  - HttpService must be enabled (Game Settings → Security → Allow HTTP Requests)
  - Backend must be running at BACKEND_URL
]]

local Config = require(script.Parent.src.core.Config)
local Events = require(script.Parent.src.core.Events)
local StudioConnector = require(script.Parent.src.services.StudioConnector)
local ConnectionManager = require(script.Parent.src.services.ConnectionManager)
local SyncManager = require(script.Parent.src.services.SyncManager)
local CommandPanel = require(script.Parent.src.ui.CommandPanel)
local ArtifactLoader = require(script.Parent.src.utils.ArtifactLoader)
local ErrorReporter = require(script.Parent.src.utils.ErrorReporter)

local errorReporter = ErrorReporter.new()
local events = Events.new()
local artifactLoader = ArtifactLoader.new(errorReporter)
local studioConnector = StudioConnector.new()
local connectionManager = ConnectionManager.new(studioConnector, events, errorReporter)
local syncManager = SyncManager.new(studioConnector, artifactLoader, events, errorReporter)

local toolbar = plugin:CreateToolbar("Roblox AI Studio")
local toggleButton = toolbar:CreateButton(
    "AI Studio",
    "Open Roblox AI Studio panel",
    "rbxassetid://0",
    "AI Studio"
)

local commandPanel = CommandPanel.new(plugin, connectionManager, syncManager, events, errorReporter)

toggleButton.Click:Connect(function()
    commandPanel:toggle()
end)

events:on("STUDIO_CONNECTED", function(payload)
    print("[AI Studio] Connected to backend. Client:", payload.clientId)
end)

events:on("STUDIO_DISCONNECTED", function()
    print("[AI Studio] Disconnected from backend.")
end)

events:on("COMMAND_RECEIVED", function(payload)
    print("[AI Studio] Export command received:", payload.commandId)
end)

events:on("PROJECT_SYNC_COMPLETED", function(payload)
    print(string.format(
        "[AI Studio] Verified import completed: %d artifacts (%s)",
        payload.artifactCount or 0,
        payload.executionId or "unknown execution"
    ))
end)

events:on("PROJECT_SYNC_FAILED", function(payload)
    warn("[AI Studio] Import failed:", payload.error)
end)

events:on("CONNECTION_FAILED", function(payload)
    warn("[AI Studio] Connection failed:", payload.error)
end)

plugin.Unloading:Connect(function()
    syncManager:destroy()
    connectionManager:destroy()
    commandPanel:destroy()
    print("[AI Studio] Plugin unloaded.")
end)

print(string.format(
    "[AI Studio] Plugin v%s loaded. Backend: %s",
    Config.PLUGIN_VERSION,
    Config.BACKEND_URL
))
