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

local BACKEND_URL = "http://localhost:5000"
local API_KEY = "" -- Optional: set your API key here
local PLUGIN_VERSION = "2.1.0"

-- ═══════════════════════════════════════════════════════════════
-- Module Loading
-- ═══════════════════════════════════════════════════════════════

local ApiClient = require(script.Parent.src.ApiClient)
local ConnectionManager = require(script.Parent.src.ConnectionManager)
local SyncManager = require(script.Parent.src.SyncManager)
local Events = require(script.Parent.src.Events)
local UI = require(script.Parent.src.UI)

-- ═══════════════════════════════════════════════════════════════
-- Initialization
-- ═══════════════════════════════════════════════════════════════

local events = Events.new()
local api = ApiClient.new(BACKEND_URL, API_KEY)
local connectionManager = ConnectionManager.new(api, events)
local syncManager = SyncManager.new(api, events)

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

local ui = UI.new(plugin, connectionManager, syncManager, events)

toggleButton.Click:Connect(function()
    ui:toggle()
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
    ui:destroy()
    print("[AI Studio] Plugin unloaded.")
end)

print(string.format("[AI Studio] Plugin v%s loaded. Backend: %s", PLUGIN_VERSION, BACKEND_URL))
