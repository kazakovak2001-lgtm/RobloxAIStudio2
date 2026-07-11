--[[
  ConnectionManager — Manages connection lifecycle with the AI Studio backend.
  Handles connect, disconnect, heartbeat, and auto-reconnect.
]]

local ConnectionManager = {}
ConnectionManager.__index = ConnectionManager

function ConnectionManager.new(apiClient, events)
    local self = setmetatable({}, ConnectionManager)
    self._api = apiClient
    self._events = events
    self._connected = false
    self._heartbeatThread = nil
    self._projectId = nil
    self._reconnectAttempts = 0
    self._maxReconnectAttempts = 5
    return self
end

function ConnectionManager:isConnected()
    return self._connected
end

function ConnectionManager:getProjectId()
    return self._projectId
end

function ConnectionManager:connect(projectId)
    self._projectId = projectId

    local studioVersion = string.format("%s", game:GetService("StudioService") and "2024.1.0" or "unknown")
    local result = self._api:connect(studioVersion, projectId)

    if result and result.success and result.data then
        self._api:setSession(result.data.sessionId, result.data.clientId)
        self._connected = true
        self._reconnectAttempts = 0
        self._events:fire("STUDIO_CONNECTED", {
            clientId = result.data.clientId,
            sessionId = result.data.sessionId,
            projectId = projectId,
        })
        self:_startHeartbeat()
        return true
    else
        self._events:fire("CONNECTION_FAILED", {
            error = result and result.error or "Unknown error",
        })
        return false
    end
end

function ConnectionManager:disconnect()
    self:_stopHeartbeat()
    local result = self._api:disconnect()
    self._connected = false
    self._events:fire("STUDIO_DISCONNECTED", {
        clientId = self._api:getClientId(),
    })
    return result and result.success or false
end

function ConnectionManager:_startHeartbeat()
    self:_stopHeartbeat()
    self._heartbeatThread = task.spawn(function()
        while self._connected do
            task.wait(15)
            if not self._connected then break end

            local result = self._api:heartbeat()
            if not result or not result.success then
                warn("[AIStudio] Heartbeat failed, attempting reconnect...")
                self._connected = false
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
    if self._reconnectAttempts >= self._maxReconnectAttempts then
        self._events:fire("RECONNECT_FAILED", {
            attempts = self._reconnectAttempts,
        })
        return
    end

    self._reconnectAttempts = self._reconnectAttempts + 1
    self._events:fire("RECONNECTING", {
        attempt = self._reconnectAttempts,
    })

    task.wait(2 * self._reconnectAttempts) -- Exponential backoff
    if self._projectId then
        self:connect(self._projectId)
    end
end

function ConnectionManager:destroy()
    self:disconnect()
end

return ConnectionManager
