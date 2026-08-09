--[[
  WorldSceneMaterializer — Builds the delivered WORLD scene as real Instances.

  WORLD-1B. This is DESIGN-TIME materialization. The playable world is still
  built imperatively by the generated server Script into Workspace at run time,
  because the playability contract requires it; this scene is delivered into
  ReplicatedStorage.AIStudioArtifacts, which nothing in generated Lua reads.
  The two never contend because they are never in the same container. Moving
  this into Workspace would give the creator two worlds, and is WORLD-1C.

  The same three rules that govern UITreeMaterializer govern this module, for
  the same reasons.

  1. The allowlists below are a SECURITY CONTROL and are deliberately an
     independent copy of the backend's rather than a trusted mirror. Only
     Folder, Model and Part can be constructed: no script class appears here,
     and none of these classes accepts Source, so executable code cannot be
     introduced through this contract at all.

  2. NO PARTIALLY BUILT SCENE IS EVER ATTACHED. The whole scene is validated,
     then built detached, and only attached once every instance exists.
     SyncManager:_processExport reports a failed command WITHOUT rolling back
     instances already created, so a half-built zone would simply persist.

     Stated precisely: a validation or build failure leaves the DataModel
     untouched. A failure during attach may leave some zones replaced and
     others not; roots that never reached the DataModel are discarded and the
     export is reported failed.

  3. Ownership is respected. Only instances carrying AIStudioManaged are ever
     destroyed. A generated zone or entity name colliding with an instance the
     creator built by hand fails the export rather than deleting their work,
     and creator-authored instances found at any depth inside a managed subtree
     are moved into AIStudioPreserved first.
]]

local WorldSceneMaterializer = {}
WorldSceneMaterializer.__index = WorldSceneMaterializer

WorldSceneMaterializer.SCENE_VERSION = 1
WorldSceneMaterializer.MAX_DEPTH = 6
WorldSceneMaterializer.MAX_NODES = 400

local MANAGED_ATTRIBUTE = "AIStudioManaged"
local DELIVERY_MODE_ATTRIBUTE = "AIStudioDeliveryMode"
local DELIVERY_MODE = "design-time"
local PRESERVED_FOLDER = "AIStudioPreserved"
local MAX_SAFE_INT = 2147483647
local MAX_NAME_LENGTH = 50

-- WORLD_CLASSES_BEGIN
local ALLOWED_CLASSES = {
    Folder = true,
    Model = true,
    Part = true,
}
-- WORLD_CLASSES_END

-- WORLD_PROPERTIES_BEGIN
local ALLOWED_PROPERTIES = {
    Folder = {},
    Model = {},
    Part = {
        Size = "vector3",
        Position = "vector3",
        Anchored = "bool",
        CanCollide = "bool",
        CanTouch = "bool",
        Color = "color3",
        Transparency = "number",
        Material = "enum",
    },
}
-- WORLD_PROPERTIES_END

-- WORLD_ENUM_ITEMS_BEGIN
local ALLOWED_ENUM_ITEMS = {
    Material = {
        Plastic = true,
        SmoothPlastic = true,
        Neon = true,
        Wood = true,
        Metal = true,
        Glass = true,
    },
}
-- WORLD_ENUM_ITEMS_END

-- WORLD_ATTRIBUTES_BEGIN
local ALLOWED_ATTRIBUTES = {
    AIStudioWorldEntityId = "string",
    AIStudioWorldRole = "string",
    AIStudioWorldSource = "string",
    AIStudioWorldQuantity = "int",
    AIStudioWorldRelations = "string",
    AIStudioWorldRequires = "string",
    AIStudioWorldZone = "string",
    AIStudioWorldModelVersion = "int",
}
-- WORLD_ATTRIBUTES_END

local function isValidInstanceName(name)
    if type(name) ~= "string" then return false end
    if #name == 0 or #name > MAX_NAME_LENGTH then return false end
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
        if not isInteger(value.value) or math.abs(value.value) > MAX_SAFE_INT then
            return "must carry a 32-bit integer"
        end
    elseif expectedKind == "number" then
        if not isFiniteNumber(value.value) then return "must carry a finite number" end
    elseif expectedKind == "string" then
        if type(value.value) ~= "string" then return "must carry a string" end
    elseif expectedKind == "vector3" then
        if not (isFiniteNumber(value.x) and isFiniteNumber(value.y) and isFiniteNumber(value.z)) then
            return "must carry finite x/y/z"
        end
    elseif expectedKind == "color3" then
        if not (isRgbChannel(value.r) and isRgbChannel(value.g) and isRgbChannel(value.b)) then
            return "must carry integer r/g/b in 0-255"
        end
    elseif expectedKind == "enum" then
        if type(value.enumName) ~= "string" or type(value.item) ~= "string" then
            return "must carry string enumName/item"
        end
        -- The enum name always equals the property name in this contract, so a
        -- mismatched-but-allowlisted enum cannot pass validation and then fail
        -- at assignment time with a less precise message.
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

--[[ Validate a typed attribute value. Returns nil when valid, else a message. ]]
local function validateAttributeValue(value, expectedKind)
    if type(value) ~= "table" then return "must be a typed attribute value" end
    if value.kind ~= expectedKind then
        return string.format("must have kind %s, received %s", expectedKind, tostring(value.kind))
    end
    if expectedKind == "string" then
        if type(value.value) ~= "string" then return "must carry a string" end
        if #value.value > 1024 then return "must carry a string of at most 1024 characters" end
    elseif expectedKind == "int" then
        if not isInteger(value.value) or math.abs(value.value) > MAX_SAFE_INT then
            return "must carry a 32-bit integer"
        end
    elseif expectedKind == "bool" then
        if type(value.value) ~= "boolean" then return "must carry a boolean" end
    else
        return "has an unsupported attribute kind " .. tostring(expectedKind)
    end
    return nil
end

local function buildPropertyValue(value)
    local kind = value.kind
    if kind == "bool" or kind == "int" or kind == "number" or kind == "string" then
        return value.value
    elseif kind == "vector3" then
        return Vector3.new(value.x, value.y, value.z)
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
    if depth > WorldSceneMaterializer.MAX_DEPTH then
        return nil, string.format("%s exceeds the maximum depth of %d", path, WorldSceneMaterializer.MAX_DEPTH)
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
        return nil, string.format("world scene exceeds the %d-instance budget", WorldSceneMaterializer.MAX_NODES)
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

    if node.attributes ~= nil then
        if type(node.attributes) ~= "table" then
            return nil, nodePath .. " attributes must be an object"
        end
        for attribute, value in pairs(node.attributes) do
            local expectedKind = ALLOWED_ATTRIBUTES[attribute]
            if not expectedKind then
                return nil, string.format("%s has an attribute outside the allowlist: %s", nodePath, tostring(attribute))
            end
            local issue = validateAttributeValue(value, expectedKind)
            if issue then
                return nil, string.format("%s@%s %s", nodePath, attribute, issue)
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
  Validate the whole delivered scene. Returns true, or false plus a message.
  Creates nothing, which is what makes the build phase atomic.
]]
function WorldSceneMaterializer.validate(scene)
    if type(scene) ~= "table" then
        return false, "world scene must be an object"
    end
    if scene.sceneVersion ~= WorldSceneMaterializer.SCENE_VERSION then
        return false, string.format(
            "world scene sceneVersion must be %d, received %s",
            WorldSceneMaterializer.SCENE_VERSION,
            tostring(scene.sceneVersion)
        )
    end
    if type(scene.zones) ~= "table" then
        return false, "world scene must contain a zones array"
    end

    local budget = WorldSceneMaterializer.MAX_NODES
    local seenZones = {}
    local seenEntities = {}

    for zoneIndex, zone in ipairs(scene.zones) do
        local label = "zone " .. tostring(zoneIndex)
        if type(zone) ~= "table" then return false, label .. " must be an object" end
        if not isValidInstanceName(zone.zoneName) then
            return false, label .. " requires a valid zoneName"
        end
        if seenZones[zone.zoneName] then
            return false, "duplicate zoneName " .. zone.zoneName
        end
        seenZones[zone.zoneName] = true

        if type(zone.entities) ~= "table" then
            return false, zone.zoneName .. " requires an entities array"
        end

        -- The zone Folder itself is an instance.
        budget = budget - 1
        if budget < 0 then
            return false, string.format("world scene exceeds the %d-instance budget", WorldSceneMaterializer.MAX_NODES)
        end

        local seenNamesInZone = {}
        for entityIndex, entity in ipairs(zone.entities) do
            local entityLabel = zone.zoneName .. " entity " .. tostring(entityIndex)
            if type(entity) ~= "table" then return false, entityLabel .. " must be an object" end
            if type(entity.entityId) ~= "string" or entity.entityId == "" then
                return false, entityLabel .. " requires a semantic entityId"
            end
            -- Semantic identity is global: the same claim must not appear in
            -- two zones, or a receipt could not identify which one it means.
            if seenEntities[entity.entityId] then
                return false, "duplicate entityId " .. entity.entityId
            end
            seenEntities[entity.entityId] = true

            if type(entity.node) ~= "table" then
                return false, entityLabel .. " requires a node"
            end
            if seenNamesInZone[entity.node.name] then
                return false, string.format("%s has duplicate entity name %s", zone.zoneName, tostring(entity.node.name))
            end
            seenNamesInZone[entity.node.name] = true

            local consumed, err = validateNode(entity.node, zone.zoneName, 2, budget)
            if not consumed then return false, err end
            budget = budget - consumed
        end
    end

    return true
end

local function isManaged(instance)
    return instance:GetAttribute(MANAGED_ATTRIBUTE) == true
end

--[[
  Collect the topmost creator-authored instances inside a managed subtree.
  Recursion stops at each unmanaged instance, since everything below it is the
  creator's own structure and must move as one piece.
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

local function preserveUnmanagedContent(existing, destination)
    local rescued = collectUnmanagedDescendants(existing, {})
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

    if node.attributes then
        for attribute, value in pairs(node.attributes) do
            instance:SetAttribute(attribute, value.value)
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
  Materialize the delivered scene under stageFolder.

  Returns a list of { entityId, instancePath } pairs on success, or nil plus a
  message. Nothing is attached unless every zone built successfully.
]]
function WorldSceneMaterializer.materialize(scene, stageFolder)
    local ok, err = WorldSceneMaterializer.validate(scene)
    if not ok then return nil, err end

    -- Ownership precheck, before anything is constructed. A generated name
    -- colliding with a hand-built instance must fail the export rather than
    -- destroy the creator's work.
    for _, zone in ipairs(scene.zones) do
        local existingZone = stageFolder:FindFirstChild(zone.zoneName)
        if existingZone and not isManaged(existingZone) then
            return nil, string.format(
                "Refusing to replace %s: an instance with that name exists and is not managed by AI Studio",
                existingZone:GetFullName()
            )
        end
        if existingZone then
            for _, entity in ipairs(zone.entities) do
                local existingEntity = existingZone:FindFirstChild(entity.node.name)
                if existingEntity and not isManaged(existingEntity) then
                    return nil, string.format(
                        "Refusing to replace %s: an instance with that name exists and is not managed by AI Studio",
                        existingEntity:GetFullName()
                    )
                end
            end
        end
    end

    -- Build every zone detached. A failure here leaves the DataModel
    -- untouched, so there is no partially built scene to roll back.
    local built = {}
    local buildOk, buildErr = pcall(function()
        for _, zone in ipairs(scene.zones) do
            local zoneRoot = Instance.new("Folder")
            zoneRoot.Name = zone.zoneName
            zoneRoot:SetAttribute(MANAGED_ATTRIBUTE, true)
            zoneRoot:SetAttribute(DELIVERY_MODE_ATTRIBUTE, DELIVERY_MODE)

            local entities = {}
            for _, entity in ipairs(zone.entities) do
                local node = buildNode(entity.node)
                node.Parent = zoneRoot
                table.insert(entities, { entityId = entity.entityId, name = entity.node.name })
            end

            table.insert(built, { zoneName = zone.zoneName, root = zoneRoot, entities = entities })
        end
    end)

    if not buildOk then
        for _, entry in ipairs(built) do
            entry.root:Destroy()
        end
        return nil, "Failed to build the world scene: " .. tostring(buildErr)
    end

    local delivered = {}
    local attachOk, attachErr = pcall(function()
        for _, entry in ipairs(built) do
            local existing = stageFolder:FindFirstChild(entry.zoneName)
            if existing then
                preserveUnmanagedContent(existing, entry.root)
                existing:Destroy()
            end
            entry.root.Parent = stageFolder
            entry.attached = true

            for _, entity in ipairs(entry.entities) do
                local instance = entry.root:FindFirstChild(entity.name)
                table.insert(delivered, {
                    entityId = entity.entityId,
                    instancePath = instance:GetFullName(),
                })
            end
        end

        -- Sweep managed zones no longer delivered. A zone holding creator
        -- content is preserved into the stage folder rather than destroyed.
        local deliveredZones = {}
        for _, entry in ipairs(built) do
            deliveredZones[entry.zoneName] = true
        end
        for _, child in ipairs(stageFolder:GetChildren()) do
            if child:IsA("Folder") and isManaged(child) and not deliveredZones[child.Name] then
                preserveUnmanagedContent(child, stageFolder)
                child:Destroy()
            end
        end
    end)

    if not attachOk then
        for _, entry in ipairs(built) do
            if not entry.attached then
                entry.root:Destroy()
            end
        end
        return nil, "Failed to attach the world scene: " .. tostring(attachErr)
    end

    return delivered
end

return WorldSceneMaterializer
