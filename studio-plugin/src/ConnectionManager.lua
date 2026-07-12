--[[
  ConnectionManager — Lifecycle management with heartbeat and auto-reconnect.
]]

local Config = require(script.Parent.Config)

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

function ConnectionManager:connect()
    self._status = "connecting"
    local ok = self._connector:connect()
    if ok then
        self._status = "connected"
        self._reconnectAttempts = 0
        self:_startHeartbeat()
        return true
    else
        self._status = "failed"
        self._errors:report("Connection failed")
        return false
    end
end

function ConnectionManager:disconnect()
    self:_stopHeartbeat()
    self._connector:disconnect()
    self._status = "disconnected"
end

function ConnectionManager:getStatus()
    return self._status
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
    while self._reconnectAttempts < Config.RECONNECT_MAX_ATTEMPTS do
        self._reconnectAttempts = self._reconnectAttempts + 1
        task.wait(2 * self._reconnectAttempts)
        if self._connector:connect() then
            self._status = "connected"
            self._reconnectAttempts = 0
            self:_startHeartbeat()
            return
        end
    end
    self._status = "failed"
    self._errors:report("Reconnect failed after " .. Config.RECONNECT_MAX_ATTEMPTS .. " attempts")
end

function ConnectionManager:destroy()
    self:disconnect()
end

return ConnectionManager
