--[[
  ErrorReporter — Centralized error collection and reporting.
]]

local ErrorReporter = {}
ErrorReporter.__index = ErrorReporter

function ErrorReporter.new()
    local self = setmetatable({}, ErrorReporter)
    self._errors = {}
    self._maxErrors = 100
    return self
end

function ErrorReporter:report(message, severity)
    local entry = {
        message = message,
        severity = severity or "error",
        timestamp = os.time(),
    }
    table.insert(self._errors, entry)
    if #self._errors > self._maxErrors then
        table.remove(self._errors, 1)
    end
    warn("[AI Studio] " .. (severity or "ERROR") .. ": " .. message)
end

function ErrorReporter:getErrors()
    return self._errors
end

function ErrorReporter:getLastError()
    return self._errors[#self._errors]
end

function ErrorReporter:clear()
    self._errors = {}
end

function ErrorReporter:count()
    return #self._errors
end

return ErrorReporter
