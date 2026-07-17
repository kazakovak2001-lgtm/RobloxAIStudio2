--[[
  ApiClient — HTTP communication layer for Roblox AI Studio backend.
  Handles all HTTP requests with error handling and session management.
]]

local HttpService = game:GetService("HttpService")

local ApiClient = {}
ApiClient.__index = ApiClient

function ApiClient.new(baseUrl, apiKey)
    local self = setmetatable({}, ApiClient)
    self._baseUrl = baseUrl or "http://localhost:5000"
    self._apiKey = apiKey or ""
    self._sessionId = nil
    self._clientId = nil
    return self
end

function ApiClient:setSession(sessionId, clientId)
    self._sessionId = sessionId
    self._clientId = clientId
end

function ApiClient:getClientId()
    return self._clientId
end

function ApiClient:getSessionId()
    return self._sessionId
end

function ApiClient:request(method, path, body)
    local url = self._baseUrl .. path
    local headers = {
        ["Content-Type"] = "application/json",
    }

    if self._apiKey ~= "" then
        headers["X-API-Key"] = self._apiKey
    end
    if self._sessionId then
        headers["X-Studio-Session"] = self._sessionId
    end

    local success, response = pcall(function()
        if method == "GET" then
            return HttpService:GetAsync(url, false, headers)
        elseif method == "POST" then
            local jsonBody = body and HttpService:JSONEncode(body) or "{}"
            return HttpService:PostAsync(url, jsonBody, Enum.HttpContentType.ApplicationJson, false, headers)
        end
    end)

    if not success then
        return { success = false, error = tostring(response) }
    end

    local decodeSuccess, data = pcall(function()
        return HttpService:JSONDecode(response)
    end)

    if not decodeSuccess then
        return { success = false, error = "Failed to decode response" }
    end

    return data
end

function ApiClient:get(path)
    return self:request("GET", path, nil)
end

function ApiClient:post(path, body)
    return self:request("POST", path, body)
end

-- Studio API methods

function ApiClient:connect(studioVersion, projectId)
    return self:post("/api/studio/connect", {
        studioVersion = studioVersion,
        projectId = projectId,
    })
end

function ApiClient:disconnect()
    if not self._clientId then return { success = false, error = "Not connected" } end
    return self:post("/api/studio/disconnect", {
        clientId = self._clientId,
    })
end

function ApiClient:heartbeat()
    if not self._clientId then return { success = false, error = "Not connected" } end
    return self:post("/api/studio/heartbeat", {
        clientId = self._clientId,
    })
end

function ApiClient:getStatus()
    return self:get("/api/studio/status")
end

function ApiClient:syncProject(projectId)
    return self:post("/api/studio/sync/project", {
        projectId = projectId,
    })
end

function ApiClient:syncArtifacts(artifactIds)
    return self:post("/api/studio/sync/artifacts", {
        artifactIds = artifactIds,
    })
end

return ApiClient
