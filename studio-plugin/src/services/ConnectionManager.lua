--[[
  ConnectionManager — Lifecycle management with heartbeat and auto-reconnect.
]]

local Config = require(script.Parent.core.Config)

local ConnectionManager = {}
ConnectionManager.__index = ConnectionManager

function ConnectionManager.new(connector, errorReporter)
    local self = setmetatable({}, ConnectionManager)
    self._connector = connector
    self._errors = errorReporter
    self._heartbeatThread = nil
    self._reconnectAttempts = 0
    self._status = "disconnected"
    return self
end

function ConnectionManager:connect(projectId)
    self._projectId = projectId
    self._status = "connecting"
    local ok = self._connector:connect()
    if ok then
        self._status = "connected"
        self._reconnectAttempts = 0
        self:_startHeartbeat()
        if self._events then
            self._events:fire("STUDIO_CONNECTED", {
                clientId = self._connector:getClientId(),
                sessionId = self._connector:getSessionId(),
                projectId = projectId,
            })
        end
        return true
    else
        self._status = "failed"
        self._errors:report("Connection failed")
        if self._events then
            self._events:fire("CONNECTION_FAILED", {
                error = "Connection failed",
            })
        end
        return false
    end
end

function ConnectionManager:disconnect()
    self:_stopHeartbeat()
    local clientId = self._connector:getClientId()
    self._connector:disconnect()
    self._status = "disconnected"
    if self._events then
        self._events:fire("STUDIO_DISCONNECTED", {
            clientId = clientId,
        })
    end
end

function ConnectionManager:getStatus()
    return self._status
end

function ConnectionManager:isConnected()
    return self._status == "connected"
end

function ConnectionManager:getProjectId()
    return self._projectId
end

function ConnectionManager:_startHeartbeat()
    self:_stopHeartbeat()
    self._heartbeatThread = task.spawn(function()
        while self._status == "connected" do
            task.wait(Config.HEARTBEAT_INTERVAL)
            if self._status ~= "connected" then break end
            local ok = self._connector:heartbeat()
            if not ok then
                self._status = "reconnecting"
                self:_attemptReconnect()
                break
            end
        end
    end)
end

function ConnectionManager:_stopHeartbeat()
    if self._heartbeatThread then
        task.cancel(self._heartbeatThread)
        self._heartbeatThread = nil
    end
end

function ConnectionManager:_attemptReconnect()
    if self._reconnectAttempts >= Config.RECONNECT_MAX_ATTEMPTS then
        if self._events then
            self._events:fire("RECONNECT_FAILED", {
                attempts = self._reconnectAttempts,
            })
        end
        self._status = "failed"
        self._errors:report("Reconnect failed after " .. Config.RECONNECT_MAX_ATTEMPTS .. " attempts")
        return
    end

    self._reconnectAttempts = self._reconnectAttempts + 1
    if self._events then
        self._events:fire("RECONNECTING", {
            attempt = self._reconnectAttempts,
        })
    end

    task.wait(2 * self._reconnectAttempts)
    if self._projectId then
        if self._connector:connect() then
            self._status = "connected"
            self._reconnectAttempts = 0
            self:_startHeartbeat()
            if self._events then
                self._events:fire("STUDIO_CONNECTED", {
                    clientId = self._connector:getClientId(),
                    sessionId = self._connector:getSessionId(),
                    projectId = self._projectId,
                })
            end
            return
        end
    end
end

function ConnectionManager:destroy()
    self:disconnect()
end

return ConnectionManager
