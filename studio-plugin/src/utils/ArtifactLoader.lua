--[[
  ArtifactLoader — Materializes pipeline artifacts into Roblox Studio instances.
]]

local UITreeMaterializer = require(script.Parent.UITreeMaterializer)

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local ServerStorage = game:GetService("ServerStorage")
local StarterGui = game:GetService("StarterGui")
local StarterPlayer = game:GetService("StarterPlayer")
local Workspace = game:GetService("Workspace")

local ArtifactLoader = {}
ArtifactLoader.__index = ArtifactLoader

function ArtifactLoader.new(errorReporter)
    local self = setmetatable({}, ArtifactLoader)
    self._errors = errorReporter
    self._loaded = {}
    return self
end

function ArtifactLoader:load(artifact)
    return self:loadArtifact(artifact)
end

function ArtifactLoader:loadArtifact(artifact)
    local success, result = pcall(function()
        if type(artifact) ~= "table" or type(artifact.id) ~= "string" then
            error("Artifact must include a string id")
        end

        if artifact.type == "lua" then
            return self:_loadLuaArtifact(artifact)
        end
        if artifact.type == "ui-layout" and self:_claimsUITreeSchema(artifact.content) then
            return self:_loadUITreeArtifact(artifact)
        end
        return self:_loadMetadataArtifact(artifact)
    end)

    if not success then
        local message = "Failed to load " .. tostring(artifact and artifact.name or "unknown") .. ": " .. tostring(result)
        self:_reportError(message)
        return {
            success = false,
            artifactId = artifact and artifact.id,
            error = message,
            instancePaths = {},
        }
    end

    result.success = true
    result.artifactId = artifact.id
    table.insert(self._loaded, result)
    return result
end

function ArtifactLoader:_loadLuaArtifact(artifact)
    local content = artifact.content
    if type(content) ~= "table" or type(content.scripts) ~= "table" or #content.scripts == 0 then
        error("Lua artifact content must contain a non-empty scripts array")
    end

    local instancePaths = {}
    for index, scriptDefinition in ipairs(content.scripts) do
        if type(scriptDefinition) ~= "table" then
            error("Lua script definition " .. tostring(index) .. " must be an object")
        end
        if type(scriptDefinition.path) ~= "string" or scriptDefinition.path == "" then
            error("Lua script definition " .. tostring(index) .. " requires path")
        end
        if type(scriptDefinition.content) ~= "string" then
            error("Lua script definition " .. tostring(index) .. " requires string content")
        end

        local instance = self:_upsertScript(scriptDefinition.path, scriptDefinition.content)
        table.insert(instancePaths, instance:GetFullName())
    end

    return {
        name = artifact.name,
        type = artifact.type,
        instancePath = instancePaths[1],
        instancePaths = instancePaths,
    }
end

--[[
  Absence of schemaVersion is the ONLY fallback trigger.

  Content that claims a schema version must be materialized or fail; it must
  never quietly degrade to a StringValue, because the receipt would then be
  accepted and the export recorded as verified while no tree was ever built.
  That applies equally to a future version this plugin does not understand.
]]
function ArtifactLoader:_claimsUITreeSchema(content)
    return type(content) == "table" and content.schemaVersion ~= nil
end

function ArtifactLoader:_loadUITreeArtifact(artifact)
    local stageFolder = self:_ensureStageFolder(artifact.stage or "UI_GENERATION")

    local delivered, err = UITreeMaterializer.materialize(artifact.content, stageFolder)
    if not delivered then
        -- Level 0: `err` is already a complete operator message, and the outer
        -- handler wraps it again. A position prefix would point at this
        -- rethrow rather than at the cause.
        error(err, 0)
    end

    local instancePaths = {}
    for _, entry in ipairs(delivered) do
        table.insert(instancePaths, entry.instancePath)
    end

    return {
        name = artifact.name,
        type = artifact.type,
        instancePath = instancePaths[1],
        instancePaths = instancePaths,
        -- Identity-bearing receipt: a positional array cannot prove WHICH
        -- screen landed where, so verification needs the pairing.
        screens = delivered,
    }
end

--[[ Shared root/stage folder resolution for every non-Lua artifact. ]]
function ArtifactLoader:_ensureStageFolder(stage)
    local root = ReplicatedStorage:FindFirstChild("AIStudioArtifacts")
    if root and not root:IsA("Folder") then
        root:Destroy()
        root = nil
    end
    if not root then
        root = Instance.new("Folder")
        root.Name = "AIStudioArtifacts"
        root.Parent = ReplicatedStorage
    end

    local stageName = tostring(stage or "OTHER")
    local stageFolder = root:FindFirstChild(stageName)
    if stageFolder and not stageFolder:IsA("Folder") then
        stageFolder:Destroy()
        stageFolder = nil
    end
    if not stageFolder then
        stageFolder = Instance.new("Folder")
        stageFolder.Name = stageName
        stageFolder.Parent = root
    end

    -- Migrate here rather than in the metadata path, because both paths reach
    -- a stage folder. A UI_GENERATION artifact delivered before schemaVersion
    -- existed left an id-named StringValue; once the backend starts sending a
    -- tree, routing goes through the UI path instead, and a metadata-only
    -- cleanup would leave that value beside the materialized screens forever.
    self:_removeLegacyIdNamedValues(stageFolder)

    return stageFolder
end

--[[
  The logical identity of a metadata artifact inside its stage folder.

  ARTIFACT-1. Naming the instance after `artifact.id` made delivery
  non-idempotent: `ArtifactStore` mints that id with `randomUUID` on every
  store, so regenerating a project left the previous run's StringValue behind
  and the folder grew without bound. `artifact.name` is derived from the stage
  (`requirements.json`, `gameConcept.json`, …) and there is exactly one
  artifact per stage, so it is stable across regenerations and unique within
  the folder.

  Falls back to the id when a backend does not supply a name, which preserves
  the old behaviour rather than inventing an identity.
]]
function ArtifactLoader:_metadataInstanceName(artifact)
    if type(artifact.name) == "string" and artifact.name ~= "" then
        return artifact.name
    end
    return tostring(artifact.id)
end

--[[
  Remove StringValues left by the pre-ARTIFACT-1 identity.

  Deliberately narrow on two axes. A StringValue qualifies only when its Name
  equals its own ArtifactId attribute, which is the exact shape the old loader
  produced, AND when it is not currently managed. Both conditions are needed:

    - Without the name/id match, a hand-added instance could be destroyed.
    - Without the managed check, a value this loader had just written under the
      id fallback would match its own migration rule, so a second metadata
      artifact in the same stage folder would delete the first one.

  A materialized UI tree is not a StringValue, so it can never be caught here.
]]
function ArtifactLoader:_removeLegacyIdNamedValues(stageFolder)
    for _, child in ipairs(stageFolder:GetChildren()) do
        if child:IsA("StringValue") and child:GetAttribute("AIStudioManaged") ~= true then
            local recordedId = child:GetAttribute("ArtifactId")
            if type(recordedId) == "string" and recordedId == child.Name then
                child:Destroy()
            end
        end
    end
end

function ArtifactLoader:_loadMetadataArtifact(artifact)
    local stageFolder = self:_ensureStageFolder(artifact.stage or "OTHER")
    local stageName = tostring(artifact.stage or "OTHER")
    local valueName = self:_metadataInstanceName(artifact)
    local value = stageFolder:FindFirstChild(valueName)

    -- Same ownership rule the UI path follows: never destroy something the
    -- creator made. A stable name makes a collision plausible in a way the
    -- old random id never was, so this fails the export instead of guessing.
    if value and (not value:IsA("StringValue") or value:GetAttribute("AIStudioManaged") ~= true) then
        error(string.format(
            "Refusing to replace %s: an instance with that name exists and is not managed by AI Studio",
            value:GetFullName()
        ))
    end

    if not value then
        value = Instance.new("StringValue")
        value.Name = valueName
        value:SetAttribute("AIStudioManaged", true)
        value.Parent = stageFolder
    end

    local encoded = artifact.content
    if type(encoded) ~= "string" then
        encoded = HttpService:JSONEncode(encoded)
    end
    value.Value = tostring(encoded or "")
    value:SetAttribute("ArtifactId", artifact.id)
    value:SetAttribute("ArtifactType", tostring(artifact.type or "unknown"))
    value:SetAttribute("ArtifactName", tostring(artifact.name or valueName))
    value:SetAttribute("PipelineStage", stageName)

    return {
        name = artifact.name,
        type = artifact.type,
        instancePath = value:GetFullName(),
        instancePaths = { value:GetFullName() },
    }
end

function ArtifactLoader:_upsertScript(path, source)
    local segments = self:_splitPath(path)
    if #segments == 0 then error("Script path is empty") end

    local parent, startIndex = self:_resolveRoot(segments)
    for index = startIndex, #segments - 1 do
        parent = self:_ensureFolder(parent, segments[index])
    end

    local fileName = segments[#segments]
    local instanceName = self:_scriptName(fileName)
    local className = self:_scriptClass(fileName)
    local existing = parent:FindFirstChild(instanceName)
    if existing and existing.ClassName ~= className then
        existing:Destroy()
        existing = nil
    end

    local instance = existing
    if not instance then
        instance = Instance.new(className)
        instance.Name = instanceName
        instance.Parent = parent
    end

    instance.Source = source
    return instance
end

function ArtifactLoader:_resolveRoot(segments)
    local rootName = segments[1]
    if rootName == "ServerScriptService" then return ServerScriptService, 2 end
    if rootName == "ReplicatedStorage" then return ReplicatedStorage, 2 end
    if rootName == "ServerStorage" then return ServerStorage, 2 end
    if rootName == "StarterGui" then return StarterGui, 2 end
    if rootName == "Workspace" then return Workspace, 2 end
    if rootName == "StarterPlayer" then return StarterPlayer, 2 end
    if rootName == "StarterPlayerScripts" then
        return StarterPlayer:WaitForChild("StarterPlayerScripts"), 2
    end
    if rootName == "StarterCharacterScripts" then
        return StarterPlayer:WaitForChild("StarterCharacterScripts"), 2
    end

    return ReplicatedStorage, 1
end

function ArtifactLoader:_ensureFolder(parent, name)
    local existing = parent:FindFirstChild(name)
    if existing and not existing:IsA("Folder") then
        error("Path segment is not a folder: " .. existing:GetFullName())
    end
    if existing then return existing end

    local folder = Instance.new("Folder")
    folder.Name = name
    folder.Parent = parent
    return folder
end

function ArtifactLoader:_splitPath(path)
    local normalized = path:gsub("\\", "/")
    local segments = {}
    for segment in normalized:gmatch("[^/]+") do
        table.insert(segments, segment)
    end
    return segments
end

function ArtifactLoader:_scriptClass(fileName)
    if fileName:match("%.server%.lua$") then return "Script" end
    if fileName:match("%.client%.lua$") then return "LocalScript" end
    return "ModuleScript"
end

function ArtifactLoader:_scriptName(fileName)
    local name = fileName:gsub("%.server%.lua$", "")
    name = name:gsub("%.client%.lua$", "")
    name = name:gsub("%.lua$", "")
    if name == "" then return "GeneratedScript" end
    return name
end

function ArtifactLoader:_reportError(message)
    if self._errors then
        self._errors:report(message)
    else
        warn("[AI Studio] " .. message)
    end
end

function ArtifactLoader:getLoaded()
    return self._loaded
end

function ArtifactLoader:clear()
    self._loaded = {}
end

return ArtifactLoader
