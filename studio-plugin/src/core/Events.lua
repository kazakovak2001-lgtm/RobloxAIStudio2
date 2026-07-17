--[[
  Events — Simple event system for plugin internal communication.
]]

local Events = {}
Events.__index = Events

function Events.new()
    local self = setmetatable({}, Events)
    self._handlers = {}
    self._history = {}
    return self
end

function Events:on(eventType, handler)
    if not self._handlers[eventType] then
        self._handlers[eventType] = {}
    end
    table.insert(self._handlers[eventType], handler)
end

function Events:off(eventType, handler)
    local handlers = self._handlers[eventType]
    if not handlers then return end
    for i, h in ipairs(handlers) do
        if h == handler then
            table.remove(handlers, i)
            break
        end
    end
end

function Events:fire(eventType, payload)
    local entry = {
        type = eventType,
        timestamp = os.time(),
        payload = payload,
    }
    table.insert(self._history, entry)

    -- Keep history bounded
    if #self._history > 200 then
        local newHistory = {}
        for i = 101, #self._history do
            table.insert(newHistory, self._history[i])
        end
        self._history = newHistory
    end

    local handlers = self._handlers[eventType]
    if not handlers then return end
    for _, handler in ipairs(handlers) do
        task.spawn(function()
            local success, err = pcall(handler, payload)
            if not success then
                warn("[AIStudio Events] Handler error:", err)
            end
        end)
    end
end

function Events:getHistory()
    return self._history
end

return Events
