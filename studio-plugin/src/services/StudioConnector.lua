--[[
  StudioConnector — Manages protocol and REST communication with the DevKit backend.
]]

local HttpService = game:GetService("HttpService")
local Config = require(script.Parent.Parent.core.Config)

local StudioConnector = {}
StudioConnector.__index = StudioConnector

function StudioConnector.new(apiKey)
    local self = setmetatable({}, StudioConnector)
    self._sessionId = nil
    self._clientId = nil
    self._projectId = nil
    self._connected = false
    self._apiKey = apiKey or ""
    self._lastMessageId = 0
    return self
end

function StudioConnector:setApiKey(apiKey)
    self._apiKey = apiKey or ""
end

function StudioConnector:connect(projectId)
    local resolvedProjectId = projectId or (game.Name ~= "" and game.Name or "untitled")
    local payload = {
        studioVersion = tostring(game:GetService("StudioService") and "2024.1" or "unknown"),
        projectId = resolvedProjectId,
    }

    local result = self:_post("/api/studio/connect", payload)
    if result and result.success and result.data then
        self._clientId = result.data.clientId
        self._sessionId = result.data.sessionId
        self._projectId = resolvedProjectId
        self._connected = true

        self:sendMessage("HELLO", "hello", {
            pluginVersion = Config.PLUGIN_VERSION,
            studioVersion = payload.studioVersion,
            protocolVersion = Config.PROTOCOL_VERSION,
        })

        return true
    end

    if result and result.error then
        warn("[AI Studio HTTP] Connect failed: " .. tostring(result.error))
    end
    return false
end

function StudioConnector:disconnect()
    if not self._clientId then return false end
    self:_post("/api/studio/disconnect", { clientId = self._clientId })
    self._connected = false
    self._clientId = nil
    self._sessionId = nil
    self._projectId = nil
    return true
end

function StudioConnector:heartbeat()
    if not self._clientId then return false end
    local result = self:_post("/api/studio/heartbeat", { clientId = self._clientId })
    return result and result.success or false
end

function StudioConnector:sendMessage(msgType, command, payload)
    payload = payload or {}
    payload.projectId = self._projectId
    payload.clientId = self._clientId
    self._lastMessageId = self._lastMessageId + 1
    local message = {
        protocolVersion = Config.PROTOCOL_VERSION,
        messageId = "msg-" .. tostring(self._lastMessageId) .. "-" .. tostring(os.time()),
        sessionId = self._sessionId or "",
        type = msgType,
        command = command,
        timestamp = os.time() * 1000,
        direction = "client_to_server",
        payload = payload,
    }
    return self:_post("/api/studio/protocol/message", message)
end

function StudioConnector:getCommands()
    if not self._clientId then
        return { success = false, error = "Studio client is not connected" }
    end
    local clientId = HttpService:UrlEncode(self._clientId)
    return self:_get("/api/studio/commands?clientId=" .. clientId)
end

function StudioConnector:getCommand(commandId)
    if not self._clientId then
        return { success = false, error = "Studio client is not connected" }
    end
    local clientId = HttpService:UrlEncode(self._clientId)
    local encodedCommandId = HttpService:UrlEncode(commandId)
    return self:_get("/api/studio/commands/" .. encodedCommandId .. "?clientId=" .. clientId)
end

function StudioConnector:acknowledgeCommand(commandId)
    if not self._clientId then
        return { success = false, error = "Studio client is not connected" }
    end
    local encodedCommandId = HttpService:UrlEncode(commandId)
    return self:_post("/api/studio/commands/" .. encodedCommandId .. "/acknowledge", {
        clientId = self._clientId,
    })
end

function StudioConnector:reportCommand(commandId, report)
    if not self._clientId then
        return { success = false, error = "Studio client is not connected" }
    end
    local encodedCommandId = HttpService:UrlEncode(commandId)
    return self:_post("/api/studio/commands/" .. encodedCommandId .. "/result", {
        clientId = self._clientId,
        status = report.status,
        executionId = report.executionId,
        artifacts = report.artifacts or {},
        error = report.error,
        reportedAt = report.reportedAt or (os.time() * 1000),
    })
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

function StudioConnector:getProjectId()
    return self._projectId
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
    local headers = self:_headers()
    local success, response = pcall(function()
        local url = Config.BACKEND_URL .. path
        local encodedBody = HttpService:JSONEncode(body)

        if next(headers) then
            return HttpService:PostAsync(
                url,
                encodedBody,
                Enum.HttpContentType.ApplicationJson,
                false,
                headers
            )
        end

        return HttpService:PostAsync(
            url,
            encodedBody,
            Enum.HttpContentType.ApplicationJson,
            false
        )
    end)

    if not success then
        warn("[AI Studio HTTP] POST " .. path .. " failed: " .. tostring(response))
        return { success = false, error = tostring(response) }
    end

    local ok, data = pcall(function() return HttpService:JSONDecode(response) end)
    if not ok then
        warn("[AI Studio HTTP] POST " .. path .. " returned invalid JSON")
        return { success = false, error = "JSON decode failed" }
    end
    return data
end

function StudioConnector:_headers()
    -- PostAsync sets Content-Type from Enum.HttpContentType.ApplicationJson.
    -- Roblox rejects callers that also provide Content-Type in custom headers.
    local headers = {}
    if self._apiKey ~= "" then headers["X-API-Key"] = self._apiKey end
    if self._sessionId then headers["X-Studio-Session"] = self._sessionId end
    return headers
end

return StudioConnector
