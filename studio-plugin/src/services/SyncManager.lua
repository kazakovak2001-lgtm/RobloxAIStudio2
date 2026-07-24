--[[
  SyncManager — Polls the canonical Studio command queue and applies project exports.
]]

local Config = require(script.Parent.Parent.core.Config)

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
    self._processing = {}
    self._processedCommands = {}
    self._pollThread = nil
    self._running = false

    self._connectedHandler = function()
        self:start()
    end
    self._disconnectedHandler = function()
        self:stop()
    end
    if self._events then
        self._events:on("STUDIO_CONNECTED", self._connectedHandler)
        self._events:on("STUDIO_DISCONNECTED", self._disconnectedHandler)
    end

    return self
end

function SyncManager:start()
    if self._running then return end
    self._running = true
    self._pollThread = task.spawn(function()
        while self._running do
            if self._connector:isConnected() then
                self:pollNow()
            end
            task.wait(Config.COMMAND_POLL_INTERVAL)
        end
    end)
end

function SyncManager:stop()
    self._running = false
    if self._pollThread then
        task.cancel(self._pollThread)
        self._pollThread = nil
    end
end

function SyncManager:syncProject(projectId)
    if not self._connector:isConnected() then
        self:_fail(projectId, nil, nil, "Studio client is not connected")
        return false
    end
    return self:pollNow(projectId)
end

function SyncManager:pollNow(projectId)
    local response = self._connector:getCommands()
    if not response or not response.success or not response.data then
        local message = self:_responseError(response, "Failed to poll Studio commands")
        self:_reportError(message)
        if self._events then
            self._events:fire("COMMAND_POLL_FAILED", { error = message })
        end
        return false
    end

    local commands = response.data.commands or {}
    if #commands == 0 then
        if self._events then
            self._events:fire("COMMAND_QUEUE_EMPTY", {
                projectId = projectId or self._connector:getProjectId(),
            })
        end
        return true
    end

    local allSucceeded = true
    for _, command in ipairs(commands) do
        if command.type == "EXPORT_PROJECT" then
            if not self:_processExport(command) then
                allSucceeded = false
            end
        elseif self._events then
            self._events:fire("COMMAND_IGNORED", {
                commandId = command.id,
                commandType = command.type,
            })
        end
    end
    return allSucceeded
end

function SyncManager:_processExport(command)
    if type(command) ~= "table" or type(command.id) ~= "string" then
        self:_reportError("Received invalid Studio command")
        return false
    end
    if self._processing[command.id] or self._processedCommands[command.id] then
        return true
    end
    self._processing[command.id] = true

    local payload = command.payload
    local projectId = type(payload) == "table" and payload.projectId or nil
    local executionId = type(payload) == "table" and payload.executionId or nil

    if self._events then
        self._events:fire("COMMAND_RECEIVED", {
            commandId = command.id,
            commandType = command.type,
            projectId = projectId,
            executionId = executionId,
        })
        self._events:fire("PROJECT_SYNC_STARTED", {
            commandId = command.id,
            projectId = projectId,
            executionId = executionId,
        })
    end

    local valid, validationError = self:_validateExportPayload(payload)
    if not valid then
        self._processing[command.id] = nil
        self:_fail(projectId, executionId, command.id, validationError)
        return false
    end

    local acknowledge = self._connector:acknowledgeCommand(command.id)
    if not acknowledge or not acknowledge.success then
        self._processing[command.id] = nil
        self:_fail(
            projectId,
            executionId,
            command.id,
            self:_responseError(acknowledge, "Failed to acknowledge Studio export")
        )
        return false
    end

    if self._events then
        self._events:fire("COMMAND_ACKNOWLEDGED", {
            commandId = command.id,
            projectId = projectId,
            executionId = executionId,
        })
    end

    local expectedById = {}
    for _, artifactRef in ipairs(payload.snapshot.artifacts) do
        expectedById[artifactRef.id] = artifactRef
    end

    local receipts = {}
    for _, artifact in ipairs(payload.artifacts) do
        local expected = expectedById[artifact.id]
        if not expected or type(expected.hash) ~= "string" then
            self._processing[command.id] = nil
            self:_reportFailedCommand(
                command.id,
                executionId,
                receipts,
                "Export payload is missing snapshot evidence for artifact " .. tostring(artifact.id),
                projectId
            )
            return false
        end

        local loaded = self._loader:loadArtifact(artifact)
        if not loaded.success then
            self._processing[command.id] = nil
            self:_reportFailedCommand(
                command.id,
                executionId,
                receipts,
                loaded.error or "Artifact materialization failed",
                projectId
            )
            return false
        end

        table.insert(receipts, {
            artifactId = artifact.id,
            hash = expected.hash,
            instancePath = loaded.instancePath,
        })
    end

    if #receipts ~= #payload.snapshot.artifacts then
        self._processing[command.id] = nil
        self:_reportFailedCommand(
            command.id,
            executionId,
            receipts,
            string.format(
                "Expected %d artifact receipts but materialized %d",
                #payload.snapshot.artifacts,
                #receipts
            ),
            projectId
        )
        return false
    end

    local result = self._connector:reportCommand(command.id, {
        status = "completed",
        executionId = executionId,
        artifacts = receipts,
        reportedAt = os.time() * 1000,
    })
    if not result or not result.success or not result.data or result.data.verified ~= true then
        self._processing[command.id] = nil
        self:_fail(
            projectId,
            executionId,
            command.id,
            self:_responseError(result, "Backend did not verify the Studio import")
        )
        return false
    end

    self._processing[command.id] = nil
    self._processedCommands[command.id] = true
    self._lastSyncTime = os.time()
    self._syncCount = self._syncCount + 1
    for _, receipt in ipairs(receipts) do
        table.insert(self._syncedArtifacts, receipt.artifactId)
    end

    if self._events then
        self._events:fire("PROJECT_SYNC_COMPLETED", {
            commandId = command.id,
            projectId = projectId,
            executionId = executionId,
            artifactCount = #receipts,
            verified = true,
        })
    end
    return true
end

function SyncManager:_validateExportPayload(payload)
    if type(payload) ~= "table" then
        return false, "EXPORT_PROJECT payload must be an object"
    end
    if type(payload.projectId) ~= "string" or payload.projectId == "" then
        return false, "EXPORT_PROJECT payload requires projectId"
    end
    if type(payload.executionId) ~= "string" or payload.executionId == "" then
        return false, "EXPORT_PROJECT payload requires executionId"
    end
    if type(payload.artifacts) ~= "table" then
        return false, "EXPORT_PROJECT payload requires artifacts"
    end
    if type(payload.snapshot) ~= "table" or type(payload.snapshot.artifacts) ~= "table" then
        return false, "EXPORT_PROJECT payload requires snapshot artifact references"
    end
    if #payload.artifacts ~= #payload.snapshot.artifacts then
        return false, "Transferred artifact count does not match the queued snapshot"
    end
    return true
end

function SyncManager:_reportFailedCommand(commandId, executionId, receipts, errorMessage, projectId)
    local result = self._connector:reportCommand(commandId, {
        status = "failed",
        executionId = executionId,
        artifacts = receipts,
        error = errorMessage,
        reportedAt = os.time() * 1000,
    })
    local reportedError = errorMessage
    if not result or not result.success then
        reportedError = reportedError .. "; result reporting failed: " .. self:_responseError(result, "unknown error")
    end
    self:_fail(projectId, executionId, commandId, reportedError)
end

function SyncManager:_fail(projectId, executionId, commandId, message)
    self:_reportError(message)
    if self._events then
        self._events:fire("PROJECT_SYNC_FAILED", {
            commandId = commandId,
            projectId = projectId,
            executionId = executionId,
            error = message,
        })
    end
end

function SyncManager:_responseError(response, fallback)
    if type(response) == "table" then
        if type(response.error) == "string" and response.error ~= "" then
            return response.error
        end
        if type(response.reason) == "string" and response.reason ~= "" then
            return response.reason
        end
    end
    return fallback
end

function SyncManager:_reportError(message)
    if self._errors then
        self._errors:report(message)
    else
        warn("[AI Studio] " .. message)
    end
end

function SyncManager:getLastSyncTime()
    return self._lastSyncTime
end

function SyncManager:getSyncCount()
    return self._syncCount
end

function SyncManager:getSyncedArtifacts()
    return self._syncedArtifacts
end

function SyncManager:destroy()
    self:stop()
    if self._events then
        self._events:off("STUDIO_CONNECTED", self._connectedHandler)
        self._events:off("STUDIO_DISCONNECTED", self._disconnectedHandler)
    end
    self._processing = {}
    self._processedCommands = {}
    self._syncedArtifacts = {}
end

return SyncManager
