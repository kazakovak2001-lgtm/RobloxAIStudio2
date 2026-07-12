--[[
  SyncManager — Synchronizes artifacts from backend into Roblox Studio hierarchy.
]]

local Config = require(script.Parent.Config)

local SyncManager = {}
SyncManager.__index = SyncManager

function SyncManager.new(connector, artifactLoader, errorReporter)
    local self = setmetatable({}, SyncManager)
    self._connector = connector
    self._loader = artifactLoader
    self._errors = errorReporter
    self._lastSyncTime = nil
    self._syncCount = 0
    return self
end

function SyncManager:syncProject(projectId)
    -- Request project snapshot
    local result = self._connector:sendMessage("GET_PROJECT", "get_project", { projectId = projectId })
    if not result or result.status == "error" then
        self._errors:report("Sync failed: " .. (result and result.error or "no response"))
        return false
    end

    local snapshot = result.data and result.data.payload
    if not snapshot or not snapshot.artifacts then
        self._errors:report("Invalid snapshot received")
        return false
    end

    -- Get artifact IDs to transfer
    local ids = {}
    for _, art in ipairs(snapshot.artifacts) do
        table.insert(ids, art.id)
    end

    if #ids == 0 then
        self._lastSyncTime = os.time()
        self._syncCount = self._syncCount + 1
        return true
    end

    -- Request artifact content
    local transferResult = self._connector:sendMessage("GET_ARTIFACTS", "get_artifacts", { artifactIds = ids })
    if not transferResult or transferResult.status == "error" then
        self._errors:report("Artifact transfer failed")
        return false
    end

    local artifacts = transferResult.data and transferResult.data.payload and transferResult.data.payload.artifacts
    if artifacts then
        for _, artifact in ipairs(artifacts) do
            self._loader:load(artifact)
        end
    end

    self._lastSyncTime = os.time()
    self._syncCount = self._syncCount + 1
    return true
end

function SyncManager:getLastSyncTime()
    return self._lastSyncTime
end

function SyncManager:getSyncCount()
    return self._syncCount
end

return SyncManager
