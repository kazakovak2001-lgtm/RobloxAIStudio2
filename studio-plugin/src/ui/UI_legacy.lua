--[[
  UI — Plugin widget interface for Roblox AI Studio.
  Creates a DockWidgetPluginGui with connection status and actions.
]]

local UI = {}
UI.__index = UI

function UI.new(plugin, connectionManager, syncManager, events)
    local self = setmetatable({}, UI)
    self._plugin = plugin
    self._conn = connectionManager
    self._sync = syncManager
    self._events = events
    self._widget = nil
    self._elements = {}
    self:_create()
    self:_bindEvents()
    return self
end

function UI:_create()
    local widgetInfo = DockWidgetPluginGuiInfo.new(
        Enum.InitialDockState.Right,
        false, -- initially disabled
        false, -- override previous state
        300,   -- default width
        400,   -- default height
        200,   -- min width
        200    -- min height
    )

    self._widget = self._plugin:CreateDockWidgetPluginGui("RobloxAIStudio", widgetInfo)
    self._widget.Title = "Roblox AI Studio"

    -- Main frame
    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromScale(1, 1)
    frame.BackgroundColor3 = Color3.fromRGB(30, 30, 40)
    frame.BorderSizePixel = 0
    frame.Parent = self._widget

    local layout = Instance.new("UIListLayout")
    layout.SortOrder = Enum.SortOrder.LayoutOrder
    layout.Padding = UDim.new(0, 8)
    layout.Parent = frame

    local padding = Instance.new("UIPadding")
    padding.PaddingAll = UDim.new(0, 12)
    padding.Parent = frame

    -- Title
    self:_addLabel(frame, "Roblox AI Studio", 18, Color3.fromRGB(200, 200, 255), 0)

    -- Status indicator
    self._elements.statusLabel = self:_addLabel(frame, "Disconnected", 14, Color3.fromRGB(150, 150, 150), 1)

    -- Session info
    self._elements.sessionLabel = self:_addLabel(frame, "Session: —", 11, Color3.fromRGB(100, 100, 100), 2)

    -- Last sync
    self._elements.syncLabel = self:_addLabel(frame, "Last sync: Never", 11, Color3.fromRGB(100, 100, 100), 3)

    -- Buttons
    self._elements.connectBtn = self:_addButton(frame, "Connect", 4, function()
        self:_handleConnect()
    end)

    self._elements.syncBtn = self:_addButton(frame, "Sync Project", 5, function()
        self:_handleSync()
    end)

    self._elements.disconnectBtn = self:_addButton(frame, "Disconnect", 6, function()
        self:_handleDisconnect()
    end)
end

function UI:_bindEvents()
    self._events:on("STUDIO_CONNECTED", function(payload)
        self:_updateStatus("Connected", Color3.fromRGB(100, 255, 100))
        self._elements.sessionLabel.Text = "Session: " .. (payload.sessionId or "—"):sub(1, 16)
    end)

    self._events:on("STUDIO_DISCONNECTED", function()
        self:_updateStatus("Disconnected", Color3.fromRGB(150, 150, 150))
        self._elements.sessionLabel.Text = "Session: —"
    end)

    self._events:on("PROJECT_SYNC_COMPLETED", function(payload)
        self._elements.syncLabel.Text = string.format(
            "Last sync: %s (%d artifacts)",
            os.date("%H:%M:%S"),
            payload.artifactCount or 0
        )
    end)

    self._events:on("RECONNECTING", function(payload)
        self:_updateStatus("Reconnecting (" .. payload.attempt .. ")...", Color3.fromRGB(255, 200, 100))
    end)

    self._events:on("CONNECTION_FAILED", function(payload)
        self:_updateStatus("Failed: " .. (payload.error or ""), Color3.fromRGB(255, 100, 100))
    end)
end

function UI:_handleConnect()
    -- Use current place name as project identifier
    local projectId = game.Name ~= "" and game.Name or "untitled-project"
    self:_updateStatus("Connecting...", Color3.fromRGB(255, 200, 100))
    task.spawn(function()
        self._conn:connect(projectId)
    end)
end

function UI:_handleSync()
    if not self._conn:isConnected() then
        self:_updateStatus("Connect first", Color3.fromRGB(255, 100, 100))
        return
    end
    self._elements.syncLabel.Text = "Syncing..."
    task.spawn(function()
        self._sync:syncProject(self._conn:getProjectId() or "default")
    end)
end

function UI:_handleDisconnect()
    self._conn:disconnect()
end

function UI:_updateStatus(text, color)
    self._elements.statusLabel.Text = text
    self._elements.statusLabel.TextColor3 = color
end

function UI:_addLabel(parent, text, size, color, order)
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 0, size + 8)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextSize = size
    label.TextColor3 = color
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.LayoutOrder = order
    label.Parent = parent
    return label
end

function UI:_addButton(parent, text, order, callback)
    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(1, 0, 0, 32)
    btn.BackgroundColor3 = Color3.fromRGB(60, 60, 80)
    btn.TextColor3 = Color3.fromRGB(220, 220, 255)
    btn.Text = text
    btn.TextSize = 13
    btn.Font = Enum.Font.GothamMedium
    btn.LayoutOrder = order
    btn.Parent = parent

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 6)
    corner.Parent = btn

    btn.MouseButton1Click:Connect(callback)
    return btn
end

function UI:show()
    self._widget.Enabled = true
end

function UI:hide()
    self._widget.Enabled = false
end

function UI:toggle()
    self._widget.Enabled = not self._widget.Enabled
end

function UI:destroy()
    if self._widget then
        self._widget:Destroy()
    end
end

return UI
