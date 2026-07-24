--[[
  CommandPanel — Minimal plugin UI for Studio integration.
]]

local Config = require(script.Parent.Parent.core.Config)

local CommandPanel = {}
CommandPanel.__index = CommandPanel

function CommandPanel.new(plugin, connManager, syncManager, events, errors)
    local self = setmetatable({}, CommandPanel)
    self._plugin = plugin
    self._conn = connManager
    self._sync = syncManager
    self._events = events
    self._errors = errors
    self._widget = nil
    self._elements = {}
    self:_build()
    if self._events then
        self:_bindEvents()
    end
    return self
end

function CommandPanel:_build()
    local info = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 280, 350, 200, 200)
    self._widget = self._plugin:CreateDockWidgetPluginGui("AIStudioAlpha", info)
    self._widget.Title = "AI Studio"

    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromScale(1, 1)
    frame.BackgroundColor3 = Color3.fromRGB(25, 25, 35)
    frame.BorderSizePixel = 0
    frame.Parent = self._widget

    local layout = Instance.new("UIListLayout")
    layout.Padding = UDim.new(0, 6)
    layout.SortOrder = Enum.SortOrder.LayoutOrder
    layout.Parent = frame

    local pad = Instance.new("UIPadding")
    pad.PaddingTop = UDim.new(0, 10)
    pad.PaddingBottom = UDim.new(0, 10)
    pad.PaddingLeft = UDim.new(0, 10)
    pad.PaddingRight = UDim.new(0, 10)
    pad.Parent = frame

    self:_label(frame, "AI Studio v" .. Config.PLUGIN_VERSION, 16, 0)
    self._elements.statusLabel = self:_label(frame, "Disconnected", 12, 1)
    self._elements.sessionLabel = self:_label(frame, "Session: —", 11, 2)
    self._elements.syncLabel = self:_label(frame, "Import: Waiting", 11, 3)
    self:_btn(frame, "Connect", 4, function() self:_onConnect() end)
    self:_btn(frame, "Generate in Workspace", 5, function() self:_onGenerate() end)
    self:_btn(frame, "Check Export Queue", 6, function() self:_onSync() end)
    self:_btn(frame, "Disconnect", 7, function() self:_onDisconnect() end)
    self:_btn(frame, "Show Errors", 8, function() self:_onShowErrors() end)
end

function CommandPanel:_onConnect()
    local projectId = game.Name ~= "" and game.Name or "untitled-project"
    self:_updateStatus("Connecting...", Color3.fromRGB(255, 200, 100))
    task.spawn(function()
        if self._conn:connect(projectId) then
            self:_updateStatus("Connected", Color3.fromRGB(100, 255, 100))
            self._elements.syncLabel.Text = "Import: Waiting for export"
        else
            self:_updateStatus("Connection Failed", Color3.fromRGB(255, 100, 100))
        end
    end)
end

function CommandPanel:_onGenerate()
    self:_updateStatus("Generate from web Workspace", Color3.fromRGB(200, 200, 100))
end

function CommandPanel:_onSync()
    if not self._conn:isConnected() then
        self:_updateStatus("Connect first", Color3.fromRGB(255, 100, 100))
        return
    end
    self._elements.syncLabel.Text = "Import: Checking queue..."
    task.spawn(function()
        local ok = self._sync:syncProject(self._conn:getProjectId() or "default")
        if not ok then
            self._elements.syncLabel.Text = "Import: Check failed"
        end
    end)
end

function CommandPanel:_onDisconnect()
    self._conn:disconnect()
end

function CommandPanel:_onShowErrors()
    for _, err in ipairs(self._errors:getErrors()) do
        print("[AI Studio Error]", err.message)
    end
end

function CommandPanel:_updateStatus(text, color)
    self._elements.statusLabel.Text = text
    self._elements.statusLabel.TextColor3 = color
end

function CommandPanel:_bindEvents()
    self._events:on("STUDIO_CONNECTED", function(payload)
        self:_updateStatus("Connected", Color3.fromRGB(100, 255, 100))
        self._elements.sessionLabel.Text = "Session: " .. (payload.sessionId or "—"):sub(1, 16)
        self._elements.syncLabel.Text = "Import: Waiting for export"
    end)

    self._events:on("STUDIO_DISCONNECTED", function()
        self:_updateStatus("Disconnected", Color3.fromRGB(150, 150, 150))
        self._elements.sessionLabel.Text = "Session: —"
        self._elements.syncLabel.Text = "Import: Waiting"
    end)

    self._events:on("COMMAND_RECEIVED", function(payload)
        self._elements.syncLabel.Text = "Import: Command " .. (payload.commandId or "received")
    end)

    self._events:on("COMMAND_ACKNOWLEDGED", function()
        self._elements.syncLabel.Text = "Import: Applying artifacts..."
    end)

    self._events:on("COMMAND_QUEUE_EMPTY", function()
        if self._conn:isConnected() then
            self._elements.syncLabel.Text = "Import: Waiting for export"
        end
    end)

    self._events:on("PROJECT_SYNC_COMPLETED", function(payload)
        self:_updateStatus("Verified", Color3.fromRGB(100, 255, 100))
        self._elements.syncLabel.Text = string.format(
            "Verified: %s (%d artifacts)",
            os.date("%H:%M:%S"),
            payload.artifactCount or 0
        )
    end)

    self._events:on("PROJECT_SYNC_FAILED", function(payload)
        self:_updateStatus("Import Failed", Color3.fromRGB(255, 100, 100))
        self._elements.syncLabel.Text = "Import: " .. (payload.error or "Failed")
    end)

    self._events:on("RECONNECTING", function(payload)
        self:_updateStatus("Reconnecting (" .. payload.attempt .. ")...", Color3.fromRGB(255, 200, 100))
    end)

    self._events:on("CONNECTION_FAILED", function(payload)
        self:_updateStatus("Failed: " .. (payload.error or ""), Color3.fromRGB(255, 100, 100))
    end)
end

function CommandPanel:show()
    self._widget.Enabled = true
end

function CommandPanel:hide()
    self._widget.Enabled = false
end

function CommandPanel:toggle()
    self._widget.Enabled = not self._widget.Enabled
end

function CommandPanel:destroy()
    if self._widget then self._widget:Destroy() end
end

function CommandPanel:_label(parent, text, size, order)
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 0, size + 8)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextSize = size
    label.TextColor3 = Color3.fromRGB(200, 200, 220)
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.TextTruncate = Enum.TextTruncate.AtEnd
    label.LayoutOrder = order
    label.Parent = parent
    return label
end

function CommandPanel:_btn(parent, text, order, callback)
    local button = Instance.new("TextButton")
    button.Size = UDim2.new(1, 0, 0, 28)
    button.BackgroundColor3 = Color3.fromRGB(50, 50, 70)
    button.TextColor3 = Color3.fromRGB(210, 210, 240)
    button.Text = text
    button.TextSize = 12
    button.Font = Enum.Font.GothamMedium
    button.LayoutOrder = order
    button.Parent = parent
    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 5)
    corner.Parent = button
    button.MouseButton1Click:Connect(callback)
    return button
end

return CommandPanel
