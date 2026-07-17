--[[
  SyncManager — Synchronizes artifacts from backend into Roblox Studio hierarchy.
]]

local Config = require(script.Parent.core.Config)

local SyncManager = {}
SyncManager.__index = SyncManager

function SyncManager.new(connector, artifactLoader, events, errorReporter)
    local self = setmetatable({}, SyncManager)
    self._connector = connector
    self._loader = artifactLoader
    self._events = events
    self._errors = errorReporter
    self._lastSyncTime = nil
    self._syncCount = 0
    self._syncedArtifacts = {}
    return self
end

function SyncManager:syncProject(projectId)
    if self._events then
        self._events:fire("PROJECT_SYNC_STARTED", { projectId = projectId })
    end

    -- Request project snapshot
    local result = self._connector:sendMessage("GET_PROJECT", "get_project", { projectId = projectId })
    if not result or result.status == "error" then
        self._errors:report("Sync failed: " .. (result and result.error or "no response"))
        if self._events then
            self._events:fire("PROJECT_SYNC_FAILED", {
                error = result and result.error or "Failed to fetch project",
            })
        end
        return false
    end

    local snapshot = result.data and result.data.payload
    if not snapshot or not snapshot.artifacts then
        self._errors:report("Invalid snapshot received")
        if self._events then
            self._events:fire("PROJECT_SYNC_COMPLETED", {
                projectId = projectId,
                artifactCount = 0,
            })
        end
        self._lastSyncTime = os.time()
        self._syncCount = self._syncCount + 1
        return true
    end

    -- Get artifact IDs to transfer
    local ids = {}
    for _, art in ipairs(snapshot.artifacts) do
        table.insert(ids, art.id)
    end

    if #ids == 0 then
        self._lastSyncTime = os.time()
        self._syncCount = self._syncCount + 1
        if self._events then
            self._events:fire("PROJECT_SYNC_COMPLETED", {
                projectId = projectId,
                artifactCount = 0,
            })
        end
        return true
    end

    -- Request artifact content
    local transferResult = self._connector:sendMessage("GET_ARTIFACTS", "get_artifacts", { artifactIds = ids })
    if not transferResult or transferResult.status == "error" then
        self._errors:report("Artifact transfer failed")
        if self._events then
            self._events:fire("PROJECT_SYNC_FAILED", {
                error = "Artifact transfer failed",
            })
        end
        return false
    end

    local artifacts = transferResult.data and transferResult.data.payload and transferResult.data.payload.artifacts
    local artifactCount = 0
    if artifacts then
        for _, artifact in ipairs(artifacts) do
            self._loader:load(artifact)
            table.insert(self._syncedArtifacts, artifact.id)
            artifactCount = artifactCount + 1
        end
    end

    self._lastSyncTime = os.time()
    self._syncCount = self._syncCount + 1
    if self._events then
        self._events:fire("PROJECT_SYNC_COMPLETED", {
            projectId = projectId,
            artifactCount = artifactCount,
        })
    end
    return true
end

function SyncManager:getLastSyncTime()
    return self._lastSyncTime
end

function SyncManager:getSyncCount()
    return self._syncCount
end

return SyncManager
function SyncManager:destroy()
    self._syncedArtifacts = {}
end

function SyncManager:getSyncedArtifacts()
    return self._syncedArtifacts
end

