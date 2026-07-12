--[[
  CommandPanel — Minimal plugin UI for Studio integration.
]]

local CommandPanel = {}
CommandPanel.__index = CommandPanel

function CommandPanel.new(plugin, connManager, syncManager, errors)
    local self = setmetatable({}, CommandPanel)
    self._plugin = plugin
    self._conn = connManager
    self._sync = syncManager
    self._errors = errors
    self._widget = nil
    self:_build()
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
    pad.PaddingAll = UDim.new(0, 10)
    pad.Parent = frame

    self:_label(frame, "AI Studio v1.7", 16, 0)
    self._statusLabel = self:_label(frame, "Disconnected", 12, 1)
    self:_btn(frame, "Connect", 2, function() self:_onConnect() end)
    self:_btn(frame, "Generate", 3, function() self:_onGenerate() end)
    self:_btn(frame, "Sync Project", 4, function() self:_onSync() end)
    self:_btn(frame, "Show Errors", 5, function() self:_onShowErrors() end)
end

function CommandPanel:_onConnect()
    self._statusLabel.Text = "Connecting..."
    task.spawn(function()
        if self._conn:connect() then
            self._statusLabel.Text = "Connected"
            self._statusLabel.TextColor3 = Color3.fromRGB(100, 255, 100)
        else
            self._statusLabel.Text = "Connection Failed"
            self._statusLabel.TextColor3 = Color3.fromRGB(255, 100, 100)
        end
    end)
end

function CommandPanel:_onGenerate()
    self._statusLabel.Text = "Generating..."
end

function CommandPanel:_onSync()
    if self._conn:getStatus() ~= "connected" then
        self._statusLabel.Text = "Connect first"
        return
    end
    task.spawn(function()
        local ok = self._sync:syncProject(game.Name or "default")
        self._statusLabel.Text = ok and "Synced!" or "Sync Failed"
    end)
end

function CommandPanel:_onShowErrors()
    for _, err in ipairs(self._errors:getErrors()) do
        print("[Error]", err.message)
    end
end

function CommandPanel:show() self._widget.Enabled = true end
function CommandPanel:hide() self._widget.Enabled = false end
function CommandPanel:toggle() self._widget.Enabled = not self._widget.Enabled end
function CommandPanel:destroy() if self._widget then self._widget:Destroy() end end

function CommandPanel:_label(parent, text, size, order)
    local l = Instance.new("TextLabel")
    l.Size = UDim2.new(1, 0, 0, size + 8)
    l.BackgroundTransparency = 1
    l.Text = text
    l.TextSize = size
    l.TextColor3 = Color3.fromRGB(200, 200, 220)
    l.Font = Enum.Font.GothamMedium
    l.TextXAlignment = Enum.TextXAlignment.Left
    l.LayoutOrder = order
    l.Parent = parent
    return l
end

function CommandPanel:_btn(parent, text, order, callback)
    local b = Instance.new("TextButton")
    b.Size = UDim2.new(1, 0, 0, 28)
    b.BackgroundColor3 = Color3.fromRGB(50, 50, 70)
    b.TextColor3 = Color3.fromRGB(210, 210, 240)
    b.Text = text
    b.TextSize = 12
    b.Font = Enum.Font.GothamMedium
    b.LayoutOrder = order
    b.Parent = parent
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, 5)
    c.Parent = b
    b.MouseButton1Click:Connect(callback)
    return b
end

return CommandPanel
