--[[
  UITreeMaterializer — Builds delivered UI trees as real Roblox Instances.

  STUDIO-2F-A. Three rules govern this module and none of them is optional.

  1. The allowlists below are a SECURITY CONTROL, not tidiness, and they are
     deliberately an independent copy of the backend's rather than a trusted
     mirror. An unrestricted class name reaching Instance.new would let a
     payload of className "Script" with a Source property create executable
     code inside what this system calls a GUI tree, bypassing the filename
     suffix contract that is otherwise the only thing deciding what becomes a
     script. No script class appears here and no class accepts Source.

  2. NO PARTIALLY BUILT TREE IS EVER ATTACHED. The whole tree is validated,
     then built detached with no parent, and only attached once every instance
     exists. This matters because SyncManager:_processExport reports a failed
     command WITHOUT rolling back instances already created, so a half-built
     ScreenGui would simply persist in the place.

     Stated precisely, because the weaker guarantee is the true one: a
     validation or build failure leaves the DataModel untouched, since nothing
     was ever attached. A failure during the attach phase may leave some
     screens replaced and others not; roots that never reached the DataModel
     are discarded, and the export is reported failed. Attaching every screen
     as one transaction is not possible through this API.

  3. Ownership is respected. Only instances carrying the AIStudioManaged
     attribute are ever destroyed. A generated screen name that collides with
     an instance the creator built by hand fails the export rather than
     deleting their work. Creator-authored instances found ANYWHERE inside a
     screen being replaced or swept — at any depth, not merely as direct
     children — are moved into a reserved AIStudioPreserved folder first, so a
     delivery never destroys hand-authored work.
]]

local UITreeMaterializer = {}
UITreeMaterializer.__index = UITreeMaterializer

UITreeMaterializer.SCHEMA_VERSION = 1
UITreeMaterializer.MAX_DEPTH = 8
UITreeMaterializer.MAX_NODES = 250

local MANAGED_ATTRIBUTE = "AIStudioManaged"
local DELIVERY_MODE_ATTRIBUTE = "AIStudioDeliveryMode"
local DELIVERY_MODE = "design-time"

--[[
  Creator-authored instances found inside a screen being replaced are moved
  here rather than destroyed with it. The backend contract rejects this name
  for generated nodes, so a delivery can never collide with the container that
  protects the creator's work.
]]
local PRESERVED_FOLDER = "AIStudioPreserved"

-- ALLOWED_CLASSES_BEGIN
local ALLOWED_CLASSES = {
    ScreenGui = true,
    Frame = true,
    TextLabel = true,
    TextButton = true,
    TextBox = true,
    ImageLabel = true,
    ScrollingFrame = true,
    UIListLayout = true,
    UIPadding = true,
    UIAspectRatioConstraint = true,
}
-- ALLOWED_CLASSES_END

-- ALLOWED_PROPERTIES_BEGIN
local ALLOWED_PROPERTIES = {
    ScreenGui = {
        ResetOnSpawn = "bool",
        IgnoreGuiInset = "bool",
        Enabled = "bool",
        DisplayOrder = "int",
    },
    Frame = {
        Size = "udim2",
        Position = "udim2",
        AnchorPoint = "vector2",
        BackgroundColor3 = "color3",
        BackgroundTransparency = "number",
        BorderSizePixel = "int",
        Visible = "bool",
        ZIndex = "int",
        LayoutOrder = "int",
    },
    TextLabel = {
        Size = "udim2",
        Position = "udim2",
        AnchorPoint = "vector2",
        BackgroundColor3 = "color3",
        BackgroundTransparency = "number",
        BorderSizePixel = "int",
        Visible = "bool",
        ZIndex = "int",
        LayoutOrder = "int",
        Text = "string",
        Font = "enum",
        TextSize = "int",
        TextColor3 = "color3",
        TextWrapped = "bool",
        TextScaled = "bool",
        TextTransparency = "number",
        TextXAlignment = "enum",
        TextYAlignment = "enum",
    },
    TextButton = {
        Size = "udim2",
        Position = "udim2",
        AnchorPoint = "vector2",
        BackgroundColor3 = "color3",
        BackgroundTransparency = "number",
        BorderSizePixel = "int",
        Visible = "bool",
        ZIndex = "int",
        LayoutOrder = "int",
        Text = "string",
        Font = "enum",
        TextSize = "int",
        TextColor3 = "color3",
        TextWrapped = "bool",
        TextScaled = "bool",
        TextTransparency = "number",
        TextXAlignment = "enum",
        TextYAlignment = "enum",
        AutoButtonColor = "bool",
    },
    TextBox = {
        Size = "udim2",
        Position = "udim2",
        AnchorPoint = "vector2",
        BackgroundColor3 = "color3",
        BackgroundTransparency = "number",
        BorderSizePixel = "int",
        Visible = "bool",
        ZIndex = "int",
        LayoutOrder = "int",
        Text = "string",
        Font = "enum",
        TextSize = "int",
        TextColor3 = "color3",
        TextWrapped = "bool",
        TextScaled = "bool",
        TextTransparency = "number",
        TextXAlignment = "enum",
        TextYAlignment = "enum",
        PlaceholderText = "string",
        ClearTextOnFocus = "bool",
    },
    ImageLabel = {
        Size = "udim2",
        Position = "udim2",
        AnchorPoint = "vector2",
        BackgroundColor3 = "color3",
        BackgroundTransparency = "number",
        BorderSizePixel = "int",
        Visible = "bool",
        ZIndex = "int",
        LayoutOrder = "int",
        Image = "string",
        ImageTransparency = "number",
        ScaleType = "enum",
    },
    ScrollingFrame = {
        Size = "udim2",
        Position = "udim2",
        AnchorPoint = "vector2",
        BackgroundColor3 = "color3",
        BackgroundTransparency = "number",
        BorderSizePixel = "int",
        Visible = "bool",
        ZIndex = "int",
        LayoutOrder = "int",
        CanvasSize = "udim2",
        ScrollBarThickness = "int",
    },
    UIListLayout = {
        FillDirection = "enum",
        SortOrder = "enum",
        HorizontalAlignment = "enum",
        VerticalAlignment = "enum",
        Padding = "udim",
    },
    UIPadding = {
        PaddingTop = "udim",
        PaddingBottom = "udim",
        PaddingLeft = "udim",
        PaddingRight = "udim",
    },
    UIAspectRatioConstraint = {
        AspectRatio = "number",
    },
}
-- ALLOWED_PROPERTIES_END

-- ALLOWED_ENUM_ITEMS_BEGIN
local ALLOWED_ENUM_ITEMS = {
    Font = {
        Gotham = true,
        GothamBold = true,
        GothamMedium = true,
        GothamSemibold = true,
        SourceSans = true,
        SourceSansBold = true,
        SourceSansSemibold = true,
    },
    TextXAlignment = { Left = true, Center = true, Right = true },
    TextYAlignment = { Top = true, Center = true, Bottom = true },
    FillDirection = { Horizontal = true, Vertical = true },
    SortOrder = { Name = true, LayoutOrder = true },
    HorizontalAlignment = { Left = true, Center = true, Right = true },
    VerticalAlignment = { Top = true, Center = true, Bottom = true },
    ScaleType = { Stretch = true, Slice = true, Tile = true, Fit = true, Crop = true },
}
-- ALLOWED_ENUM_ITEMS_END

local MAX_SAFE_INT = 2147483647

local function isValidInstanceName(name)
    if type(name) ~= "string" then return false end
    if #name == 0 or #name > 50 then return false end
    if name == PRESERVED_FOLDER then return false end
    if not name:match("^[A-Za-z0-9_]") then return false end
    return name:match("^[A-Za-z0-9_ %-]+$") ~= nil
end

local function isFiniteNumber(value)
    return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function isInteger(value)
    return isFiniteNumber(value) and value % 1 == 0
end

local function isRgbChannel(value)
    return isInteger(value) and value >= 0 and value <= 255
end

--[[ Validate a typed property value. Returns nil when valid, else a message. ]]
local function validatePropertyValue(value, expectedKind, property)
    if type(value) ~= "table" then return "must be a typed property value" end
    if value.kind ~= expectedKind then
        return string.format("must have kind %s, received %s", expectedKind, tostring(value.kind))
    end

    if expectedKind == "bool" then
        if type(value.value) ~= "boolean" then return "must carry a boolean" end
    elseif expectedKind == "int" then
        -- Roblox integer properties are 32-bit. 1e300 is a whole number but
        -- raises on assignment, which would downgrade a precise validation
        -- message into an opaque build failure.
        if not isInteger(value.value) or math.abs(value.value) > MAX_SAFE_INT then
            return "must carry a 32-bit integer"
        end
    elseif expectedKind == "number" then
        if not isFiniteNumber(value.value) then return "must carry a finite number" end
    elseif expectedKind == "string" then
        if type(value.value) ~= "string" then return "must carry a string" end
    elseif expectedKind == "udim2" then
        if not (isFiniteNumber(value.xScale) and isFiniteNumber(value.xOffset)
            and isFiniteNumber(value.yScale) and isFiniteNumber(value.yOffset)) then
            return "must carry finite xScale/xOffset/yScale/yOffset"
        end
    elseif expectedKind == "udim" then
        if not (isFiniteNumber(value.scale) and isFiniteNumber(value.offset)) then
            return "must carry finite scale/offset"
        end
    elseif expectedKind == "vector2" then
        if not (isFiniteNumber(value.x) and isFiniteNumber(value.y)) then
            return "must carry finite x/y"
        end
    elseif expectedKind == "color3" then
        if not (isRgbChannel(value.r) and isRgbChannel(value.g) and isRgbChannel(value.b)) then
            return "must carry integer r/g/b in 0-255"
        end
    elseif expectedKind == "enum" then
        if type(value.enumName) ~= "string" or type(value.item) ~= "string" then
            return "must carry string enumName/item"
        end
        -- The enum name always equals the property name in this contract. A
        -- mismatched-but-allowlisted enum would otherwise pass validation and
        -- fail at assignment time with a far less precise message.
        if value.enumName ~= property then
            return string.format("must use enum %s, received %s", tostring(property), value.enumName)
        end
        local items = ALLOWED_ENUM_ITEMS[value.enumName]
        if not items then return "references an unknown enum " .. value.enumName end
        if not items[value.item] then
            return string.format("references an unknown %s item %s", value.enumName, value.item)
        end
    else
        return "has an unsupported value kind " .. tostring(expectedKind)
    end

    return nil
end

--[[ Construct the Roblox value. Only ever called after validation. ]]
local function buildPropertyValue(value)
    local kind = value.kind
    if kind == "bool" or kind == "int" or kind == "number" or kind == "string" then
        return value.value
    elseif kind == "udim2" then
        return UDim2.new(value.xScale, value.xOffset, value.yScale, value.yOffset)
    elseif kind == "udim" then
        return UDim.new(value.scale, value.offset)
    elseif kind == "vector2" then
        return Vector2.new(value.x, value.y)
    elseif kind == "color3" then
        return Color3.fromRGB(value.r, value.g, value.b)
    elseif kind == "enum" then
        return Enum[value.enumName][value.item]
    end
    error("Unsupported property kind " .. tostring(kind))
end

--[[
  Validate one node and its descendants. Creates nothing. Returns the number of
  nodes consumed, or nil plus a message.
]]
local function validateNode(node, path, depth, budget)
    if type(node) ~= "table" then
        return nil, path .. " must be an object"
    end
    if depth > UITreeMaterializer.MAX_DEPTH then
        return nil, string.format("%s exceeds the maximum depth of %d", path, UITreeMaterializer.MAX_DEPTH)
    end

    local className = node.className
    if type(className) ~= "string" or not ALLOWED_CLASSES[className] then
        return nil, string.format("%s has a class outside the allowlist: %s", path, tostring(className))
    end
    if not isValidInstanceName(node.name) then
        return nil, path .. " requires a valid instance name"
    end

    local nodePath = path .. "." .. node.name
    local consumed = 1
    if consumed > budget then
        return nil, string.format("UI tree exceeds the %d-instance budget", UITreeMaterializer.MAX_NODES)
    end

    if node.properties ~= nil then
        if type(node.properties) ~= "table" then
            return nil, nodePath .. " properties must be an object"
        end
        local allowed = ALLOWED_PROPERTIES[className]
        for property, value in pairs(node.properties) do
            local expectedKind = allowed[property]
            if not expectedKind then
                return nil, string.format("%s has a property outside the allowlist: %s", nodePath, tostring(property))
            end
            local issue = validatePropertyValue(value, expectedKind, property)
            if issue then
                return nil, string.format("%s.%s %s", nodePath, property, issue)
            end
        end
    end

    if node.children ~= nil then
        if type(node.children) ~= "table" then
            return nil, nodePath .. " children must be an array"
        end
        local siblingNames = {}
        for _, child in ipairs(node.children) do
            if type(child) == "table" and type(child.name) == "string" then
                if siblingNames[child.name] then
                    return nil, string.format("%s has duplicate child name %s", nodePath, child.name)
                end
                siblingNames[child.name] = true
            end
            local childConsumed, err = validateNode(child, nodePath, depth + 1, budget - consumed)
            if not childConsumed then return nil, err end
            consumed = consumed + childConsumed
        end
    end

    return consumed, nil
end

--[[
  Validate the whole delivered tree. Returns true, or false plus a message.
  Creates nothing, which is what makes the build phase atomic.
]]
function UITreeMaterializer.validate(content)
    if type(content) ~= "table" then
        return false, "UI tree must be an object"
    end
    if content.schemaVersion ~= UITreeMaterializer.SCHEMA_VERSION then
        return false, string.format(
            "UI tree schemaVersion must be %d, received %s",
            UITreeMaterializer.SCHEMA_VERSION,
            tostring(content.schemaVersion)
        )
    end
    if type(content.screens) ~= "table" or #content.screens == 0 then
        return false, "UI tree must contain a non-empty screens array"
    end

    local budget = UITreeMaterializer.MAX_NODES
    local seen = {}
    for index, screen in ipairs(content.screens) do
        local label = "screen " .. tostring(index)
        if type(screen) ~= "table" then return false, label .. " must be an object" end
        if not isValidInstanceName(screen.screenName) then
            return false, label .. " requires a valid screenName"
        end
        if seen[screen.screenName] then
            return false, "duplicate screenName " .. screen.screenName
        end
        seen[screen.screenName] = true

        if type(screen.root) ~= "table" then
            return false, screen.screenName .. " requires a root node"
        end
        if screen.root.className ~= "ScreenGui" then
            return false, screen.screenName .. " root must be a ScreenGui"
        end
        if screen.root.name ~= screen.screenName then
            return false, screen.screenName .. " root name must equal screenName"
        end

        local consumed, err = validateNode(screen.root, screen.screenName, 1, budget)
        if not consumed then return false, err end
        budget = budget - consumed
    end

    return true
end

local function isManaged(instance)
    return instance:GetAttribute(MANAGED_ATTRIBUTE) == true
end

--[[
  Collect the topmost creator-authored instances inside a managed subtree.

  Walking only direct children is not enough. A creator who adds an instance
  inside a generated container leaves it as a GRANDCHILD of the screen, and
  destroying the screen would take it with them. Recursion stops at each
  unmanaged instance, since everything below it is the creator's own structure
  and must move as one piece.
]]
local function collectUnmanagedDescendants(instance, found)
    for _, child in ipairs(instance:GetChildren()) do
        if isManaged(child) then
            collectUnmanagedDescendants(child, found)
        else
            table.insert(found, child)
        end
    end
    return found
end

--[[
  Move creator-authored instances out of a screen that is about to be replaced
  or swept, into a reserved folder under `destination`. Returns the number
  preserved. Nothing is renamed except on a name collision inside the folder,
  which cannot silently shadow a generated node because the folder name is
  reserved against generated content.
]]
local function preserveUnmanagedContent(existingScreen, destination)
    local rescued = collectUnmanagedDescendants(existingScreen, {})
    if #rescued == 0 then return 0 end

    local folder = destination:FindFirstChild(PRESERVED_FOLDER)
    if not folder or not folder:IsA("Folder") then
        folder = Instance.new("Folder")
        folder.Name = PRESERVED_FOLDER
        folder.Parent = destination
    end

    for _, instance in ipairs(rescued) do
        if folder:FindFirstChild(instance.Name) then
            instance.Name = instance.Name .. " (preserved)"
        end
        instance.Parent = folder
    end

    return #rescued
end

--[[ Build one node and its descendants, detached from the DataModel. ]]
local function buildNode(node)
    local instance = Instance.new(node.className)
    instance.Name = node.name

    if node.properties then
        for property, value in pairs(node.properties) do
            instance[property] = buildPropertyValue(value)
        end
    end

    instance:SetAttribute(MANAGED_ATTRIBUTE, true)

    if node.children then
        for _, child in ipairs(node.children) do
            buildNode(child).Parent = instance
        end
    end

    return instance
end

--[[
  Materialize the delivered tree under stageFolder.

  Returns a list of { screenName, instancePath } pairs on success, or nil plus
  a message. Nothing is attached to the DataModel unless every screen built
  successfully.
]]
function UITreeMaterializer.materialize(content, stageFolder)
    local ok, err = UITreeMaterializer.validate(content)
    if not ok then return nil, err end

    -- Ownership precheck, before anything is constructed. A generated name
    -- that collides with a hand-built instance must fail the export rather
    -- than destroy the creator's work, and must not create an ambiguous
    -- same-named sibling either.
    for _, screen in ipairs(content.screens) do
        local existing = stageFolder:FindFirstChild(screen.screenName)
        if existing and not isManaged(existing) then
            return nil, string.format(
                "Refusing to replace %s: an instance with that name exists and is not managed by AI Studio",
                existing:GetFullName()
            )
        end
    end

    -- Build every screen detached. A failure here leaves the DataModel
    -- untouched, so there is no partially built tree to roll back.
    local built = {}
    local buildOk, buildErr = pcall(function()
        for _, screen in ipairs(content.screens) do
            local root = buildNode(screen.root)
            root:SetAttribute(DELIVERY_MODE_ATTRIBUTE, DELIVERY_MODE)
            table.insert(built, { screenName = screen.screenName, root = root })
        end
    end)

    if not buildOk then
        for _, entry in ipairs(built) do
            entry.root:Destroy()
        end
        return nil, "Failed to build the UI tree: " .. tostring(buildErr)
    end

    -- Attach. Creator-authored instances found anywhere inside the screen
    -- being replaced are rescued first, at any depth, so a replacement never
    -- destroys hand-authored work.
    local delivered = {}
    local attachOk, attachErr = pcall(function()
        for _, entry in ipairs(built) do
            local existing = stageFolder:FindFirstChild(entry.screenName)
            if existing then
                preserveUnmanagedContent(existing, entry.root)
                existing:Destroy()
            end
            entry.root.Parent = stageFolder
            entry.attached = true
            table.insert(delivered, {
                screenName = entry.screenName,
                instancePath = entry.root:GetFullName(),
            })
        end

        -- Sweep managed screens that are no longer delivered. A screen holding
        -- creator content is preserved into the stage folder rather than
        -- destroyed with it.
        local deliveredNames = {}
        for _, entry in ipairs(delivered) do
            deliveredNames[entry.screenName] = true
        end
        for _, child in ipairs(stageFolder:GetChildren()) do
            if isManaged(child) and not deliveredNames[child.Name] then
                preserveUnmanagedContent(child, stageFolder)
                child:Destroy()
            end
        end
    end)

    if not attachOk then
        -- Roots that never reached the DataModel are discarded. Screens
        -- already attached stay, which is why the guarantee below is stated
        -- as "no partially built tree is ever attached" rather than "a
        -- failure leaves nothing behind".
        for _, entry in ipairs(built) do
            if not entry.attached then
                entry.root:Destroy()
            end
        end
        return nil, "Failed to attach the UI tree: " .. tostring(attachErr)
    end

    return delivered
end

return UITreeMaterializer
