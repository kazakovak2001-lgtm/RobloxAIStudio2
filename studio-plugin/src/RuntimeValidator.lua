--[[
  RuntimeValidator — Detects runtime issues in generated Roblox experiences.
  Run after ArtifactLoader has created instances.
]]

local ServerScriptService = game:GetService("ServerScriptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local RuntimeValidator = {}
RuntimeValidator.__index = RuntimeValidator

function RuntimeValidator.new()
    local self = setmetatable({}, RuntimeValidator)
    self._errors = {}
    self._warnings = {}
    self._passed = {}
    return self
end

function RuntimeValidator:validate()
    self._errors = {}
    self._warnings = {}
    self._passed = {}

    self:_checkScripts()
    self:_checkRemoteEvents()
    self:_checkSpawn()
    self:_checkHierarchy()
    self:_checkPerformance()

    return {
        errors = self._errors,
        warnings = self._warnings,
        passed = self._passed,
        score = self:_calculateScore(),
        valid = #self._errors == 0,
    }
end

function RuntimeValidator:_checkScripts()
    local scripts = ServerScriptService:GetDescendants()
    local scriptCount = 0
    for _, obj in ipairs(scripts) do
        if obj:IsA("LuaSourceContainer") then
            scriptCount = scriptCount + 1
            if obj:IsA("ModuleScript") or obj:IsA("Script") then
                if obj.Source == "" or obj.Source == "-- Empty" then
                    table.insert(self._warnings, "Empty script: " .. obj:GetFullName())
                else
                    table.insert(self._passed, "Script OK: " .. obj.Name)
                end
            end
        end
    end
    if scriptCount == 0 then
        table.insert(self._errors, "No scripts found in ServerScriptService")
    end
end

function RuntimeValidator:_checkRemoteEvents()
    local remotes = ReplicatedStorage:GetDescendants()
    local hasRemotes = false
    for _, obj in ipairs(remotes) do
        if obj:IsA("RemoteEvent") or obj:IsA("RemoteFunction") then
            hasRemotes = true
            break
        end
    end
    -- Also check if a Remotes module exists
    local remotesModule = ReplicatedStorage:FindFirstChild("Remotes")
    if remotesModule or hasRemotes then
        table.insert(self._passed, "RemoteEvents present")
    else
        table.insert(self._warnings, "No RemoteEvents found — client-server communication may not work")
    end
end

function RuntimeValidator:_checkSpawn()
    local workspace = game:GetService("Workspace")
    local hasSpawn = workspace:FindFirstChildOfClass("SpawnLocation")
    if hasSpawn then
        table.insert(self._passed, "SpawnLocation found")
    else
        table.insert(self._warnings, "No SpawnLocation — players may spawn at origin")
    end
end

function RuntimeValidator:_checkHierarchy()
    local required = {
        { service = ServerScriptService, name = "ServerScriptService" },
        { service = ReplicatedStorage, name = "ReplicatedStorage" },
    }
    for _, req in ipairs(required) do
        if #req.service:GetChildren() > 0 then
            table.insert(self._passed, req.name .. " has content")
        else
            table.insert(self._warnings, req.name .. " is empty")
        end
    end
end

function RuntimeValidator:_checkPerformance()
    local totalParts = 0
    for _, obj in ipairs(game:GetService("Workspace"):GetDescendants()) do
        if obj:IsA("BasePart") then totalParts = totalParts + 1 end
    end
    if totalParts > 50000 then
        table.insert(self._warnings, "High part count: " .. totalParts .. " (target <50,000)")
    else
        table.insert(self._passed, "Part count OK: " .. totalParts)
    end
end

function RuntimeValidator:_calculateScore()
    local total = #self._passed + #self._warnings + #self._errors
    if total == 0 then return 100 end
    local score = 100 - (#self._errors * 25) - (#self._warnings * 5)
    return math.max(0, math.min(100, score))
end

return RuntimeValidator
