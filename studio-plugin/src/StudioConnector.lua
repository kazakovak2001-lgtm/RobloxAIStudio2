--[[
  StudioConnector — Manages protocol-level communication with the DevKit backend.
  Handles HELLO, PING, PONG, STATUS, SYNC_REQUEST, SYNC_RESPONSE, PATCH_UPDATE, ERROR.
]]

local HttpService = game:GetService("HttpService")
local Config = require(script.Parent.Config)

local StudioConnector = {}
StudioConnector.__index = StudioConnector

function StudioConnector.new()
    local self = setmetatable({}, StudioConnector)
    self._sessionId = nil
    self._clientId = nil
    self._connected = false
    self._lastMessageId = 0
    return self
end

function StudioConnector:connect()
    local payload = {
        studioVersion = tostring(game:GetService("StudioService") and "2024.1" or "unknown"),
        projectId = game.Name ~= "" and game.Name or "untitled",
    }

    local result = self:_post("/api/studio/connect", payload)
    if result and result.success and result.data then
        self._clientId = result.data.clientId
        self._sessionId = result.data.sessionId
        self._connected = true

        -- Send HELLO handshake
        self:sendMessage("HELLO", "hello", {
            pluginVersion = Config.PLUGIN_VERSION,
            studioVersion = payload.studioVersion,
            protocolVersion = Config.PROTOCOL_VERSION,
        })

        return true
    end
    return false
end

function StudioConnector:disconnect()
    if not self._clientId then return false end
    self:_post("/api/studio/disconnect", { clientId = self._clientId })
    self._connected = false
    self._clientId = nil
    self._sessionId = nil
    return true
end

function StudioConnector:heartbeat()
    if not self._clientId then return false end
    local result = self:_post("/api/studio/heartbeat", { clientId = self._clientId })
    return result and result.success or false
end

function StudioConnector:sendMessage(msgType, command, payload)
    self._lastMessageId = self._lastMessageId + 1
    local message = {
        protocolVersion = Config.PROTOCOL_VERSION,
        messageId = "msg-" .. tostring(self._lastMessageId) .. "-" .. tostring(os.time()),
        sessionId = self._sessionId or "",
        type = msgType,
        command = command,
        timestamp = os.time() * 1000,
        direction = "client_to_server",
        payload = payload or {},
    }
    return self:_post("/api/studio/protocol/message", message)
end

function StudioConnector:getStatus()
    return self:_get("/api/studio/status")
end

function StudioConnector:isConnected()
    return self._connected
end

function StudioConnector:getSessionId()
    return self._sessionId
end

function StudioConnector:getClientId()
    return self._clientId
end

function StudioConnector:_get(path)
    local success, response = pcall(function()
        return HttpService:GetAsync(Config.BACKEND_URL .. path, false, self:_headers())
    end)
    if not success then return { success = false, error = tostring(response) } end
    local ok, data = pcall(function() return HttpService:JSONDecode(response) end)
    if not ok then return { success = false, error = "JSON decode failed" } end
    return data
end

function StudioConnector:_post(path, body)
    local success, response = pcall(function()
        return HttpService:PostAsync(
            Config.BACKEND_URL .. path,
            HttpService:JSONEncode(body),
            Enum.HttpContentType.ApplicationJson,
            false,
            self:_headers()
        )
    end)
    if not success then return { success = false, error = tostring(response) } end
    local ok, data = pcall(function() return HttpService:JSONDecode(response) end)
    if not ok then return { success = false, error = "JSON decode failed" } end
    return data
end

function StudioConnector:_headers()
    local h = { ["Content-Type"] = "application/json" }
    if Config.API_KEY ~= "" then h["X-API-Key"] = Config.API_KEY end
    if self._sessionId then h["X-Studio-Session"] = self._sessionId end
    return h
end

return StudioConnector
