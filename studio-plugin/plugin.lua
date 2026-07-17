--[[
  Roblox AI Studio Plugin — Entry Point
  
  This plugin connects Roblox Studio to the Roblox AI Studio DevKit backend,
  enabling AI-assisted game development directly from within Studio.
  
  Requirements:
  - HttpService must be enabled (Game Settings → Security → Allow HTTP Requests)
  - Backend must be running at BACKEND_URL
]]

-- ═══════════════════════════════════════════════════════════════
-- Configuration
-- ═══════════════════════════════════════════════════════════════

local Config = require(script.Parent.src.core.Config)

-- ═══════════════════════════════════════════════════════════════
-- Module Loading
-- ═══════════════════════════════════════════════════════════════

local Events = require(script.Parent.src.core.Events)
local StudioConnector = require(script.Parent.src.services.StudioConnector)
local ConnectionManager = require(script.Parent.src.services.ConnectionManager)
local SyncManager = require(script.Parent.src.services.SyncManager)
local CommandPanel = require(script.Parent.src.ui.CommandPanel)
local ArtifactLoader = require(script.Parent.src.utils.ArtifactLoader)
local ErrorReporter = require(script.Parent.src.utils.ErrorReporter)
local RuntimeValidator = require(script.Parent.src.utils.RuntimeValidator)

-- ═══════════════════════════════════════════════════════════════
-- Initialization
-- ═══════════════════════════════════════════════════════════════

local artifactLoader = ArtifactLoader.new()
local errorReporter = ErrorReporter.new()
local events = Events.new()
local studioConnector = StudioConnector.new()
local connectionManager = ConnectionManager.new(studioConnector, events, errorReporter)
local syncManager = SyncManager.new(studioConnector, artifactLoader, events, errorReporter)
local runtimeValidator = RuntimeValidator.new()

-- ═══════════════════════════════════════════════════════════════
-- Toolbar
-- ═══════════════════════════════════════════════════════════════

local toolbar = plugin:CreateToolbar("Roblox AI Studio")
local toggleButton = toolbar:CreateButton(
    "AI Studio",
    "Open Roblox AI Studio panel",
    "rbxassetid://0", -- placeholder icon
    "AI Studio"
)

-- ═══════════════════════════════════════════════════════════════
-- UI
-- ═══════════════════════════════════════════════════════════════

local commandPanel = CommandPanel.new(plugin, connectionManager, syncManager, events, errorReporter)

toggleButton.Click:Connect(function()
    commandPanel:toggle()
end)

-- ═══════════════════════════════════════════════════════════════
-- Event Logging
-- ═══════════════════════════════════════════════════════════════

events:on("STUDIO_CONNECTED", function(payload)
    print("[AI Studio] Connected to backend. Client:", payload.clientId)
end)

events:on("STUDIO_DISCONNECTED", function()
    print("[AI Studio] Disconnected from backend.")
end)

events:on("PROJECT_SYNC_COMPLETED", function(payload)
    print(string.format("[AI Studio] Sync completed: %d artifacts", payload.artifactCount or 0))
end)

events:on("SCRIPT_CREATED", function(payload)
    print("[AI Studio] Script created:", payload.name)
end)

events:on("SCRIPT_UPDATED", function(payload)
    print("[AI Studio] Script updated:", payload.name)
end)

events:on("CONNECTION_FAILED", function(payload)
    warn("[AI Studio] Connection failed:", payload.error)
end)

-- ═══════════════════════════════════════════════════════════════
-- Cleanup
-- ═══════════════════════════════════════════════════════════════

plugin.Unloading:Connect(function()
    connectionManager:destroy()
    syncManager:destroy()
    commandPanel:destroy()
    print("[AI Studio] Plugin unloaded.")
end)

print(string.format("[AI Studio] Plugin v%s loaded. Backend: %s", Config.PLUGIN_VERSION, Config.BACKEND_URL))
