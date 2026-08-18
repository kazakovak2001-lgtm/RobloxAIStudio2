--[[
  A Roblox instance tree small enough to reason about and real enough to test
  the plugin's ownership decisions.

  MAR-002. The Studio plugin had no executable test path: everything asserted
  about it was a string search over its source, which cannot show that a
  creator's script survives a generation that wants the same name. This stub
  supplies the handful of engine behaviours the materializers actually use, so
  the plugin's own code can be run and its effects observed.

  It models what matters and refuses to guess at the rest. Parent assignment
  moves a child between parents, Destroy detaches and marks the instance dead,
  and attributes are per-instance. Anything the plugin reaches for that is not
  here fails loudly rather than returning nil, because a stub that quietly
  answers nil turns a real defect into a passing test.
]]

local Instance = {}
local instanceMeta = {}

local SERVICES = {
    "HttpService",
    "ReplicatedStorage",
    "ServerScriptService",
    "ServerStorage",
    "StarterGui",
    "StarterPlayer",
    "Workspace",
}

-- Class hierarchy, only as deep as the plugin's IsA calls require.
local INHERITS = {
    Script = { "Script", "BaseScript", "LuaSourceContainer", "Instance" },
    LocalScript = { "LocalScript", "BaseScript", "LuaSourceContainer", "Instance" },
    ModuleScript = { "ModuleScript", "LuaSourceContainer", "Instance" },
    Folder = { "Folder", "Instance" },
    StringValue = { "StringValue", "ValueBase", "Instance" },
    ScreenGui = { "ScreenGui", "LayerCollector", "GuiBase", "Instance" },
    Frame = { "Frame", "GuiObject", "GuiBase", "Instance" },
    TextLabel = { "TextLabel", "GuiObject", "GuiBase", "Instance" },
    Part = { "Part", "BasePart", "Instance" },
    Model = { "Model", "Instance" },
}

local function newInstance(className, name)
    local fields = {
        ClassName = className,
        Name = name or className,
        _children = {},
        _attributes = {},
        _parent = nil,
        _destroyed = false,
    }
    return setmetatable({}, {
        __index = function(_, key)
            if key == "Parent" then return fields._parent end
            if fields[key] ~= nil then return fields[key] end
            return instanceMeta[key]
        end,
        __newindex = function(self, key, value)
            if key == "Parent" then
                local previous = fields._parent
                if previous then
                    for index, child in ipairs(previous._children) do
                        if child == self then
                            table.remove(previous._children, index)
                            break
                        end
                    end
                end
                fields._parent = value
                if value then table.insert(value._children, self) end
                return
            end
            fields[key] = value
        end,
        __fields = fields,
    })
end

local function fieldsOf(instance)
    return getmetatable(instance).__fields
end

function instanceMeta:IsA(className)
    local chain = INHERITS[fieldsOf(self).ClassName]
    if not chain then
        error("stub: unknown class in IsA: " .. tostring(fieldsOf(self).ClassName))
    end
    for _, candidate in ipairs(chain) do
        if candidate == className then return true end
    end
    return false
end

function instanceMeta:FindFirstChild(name)
    for _, child in ipairs(fieldsOf(self)._children) do
        if fieldsOf(child).Name == name then return child end
    end
    return nil
end

function instanceMeta:WaitForChild(name)
    local found = self:FindFirstChild(name)
    if found then return found end
    -- Studio would yield; the plugin only waits for services that exist, so a
    -- miss here is a test-setup error rather than a timing question.
    error("stub: WaitForChild missed: " .. tostring(name))
end

function instanceMeta:GetChildren()
    local copy = {}
    for index, child in ipairs(fieldsOf(self)._children) do copy[index] = child end
    return copy
end

function instanceMeta:GetDescendants()
    local found = {}
    local function walk(node)
        for _, child in ipairs(fieldsOf(node)._children) do
            table.insert(found, child)
            walk(child)
        end
    end
    walk(self)
    return found
end

function instanceMeta:Destroy()
    self.Parent = nil
    fieldsOf(self)._destroyed = true
    for _, child in ipairs(self:GetChildren()) do child:Destroy() end
end

function instanceMeta:ClearAllChildren()
    for _, child in ipairs(self:GetChildren()) do child:Destroy() end
end

function instanceMeta:GetAttribute(name)
    return fieldsOf(self)._attributes[name]
end

function instanceMeta:SetAttribute(name, value)
    fieldsOf(self)._attributes[name] = value
end

function instanceMeta:GetFullName()
    local parts = { fieldsOf(self).Name }
    local node = fieldsOf(self)._parent
    while node do
        table.insert(parts, 1, fieldsOf(node).Name)
        node = fieldsOf(node)._parent
    end
    return table.concat(parts, ".")
end

function instanceMeta:IsDestroyed()
    return fieldsOf(self)._destroyed
end

Instance.new = function(className)
    if not INHERITS[className] then
        error("stub: refusing to create an unmodelled class: " .. tostring(className))
    end
    return newInstance(className)
end

local services = {}
for _, name in ipairs(SERVICES) do
    services[name] = newInstance("Folder", name)
end
-- StarterPlayer's script containers exist in a real place file.
for _, name in ipairs({ "StarterPlayerScripts", "StarterCharacterScripts" }) do
    local container = newInstance("Folder", name)
    container.Parent = services.StarterPlayer
end

local game = {}
function game:GetService(name)
    local service = services[name]
    if not service then
        error("stub: unmodelled service: " .. tostring(name))
    end
    return service
end

return {
    Instance = Instance,
    game = game,
    services = services,
    newInstance = newInstance,
}
