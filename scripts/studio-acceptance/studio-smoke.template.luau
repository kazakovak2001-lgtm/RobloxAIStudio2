local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local expectedPluginVersion = __EXPECTED_PLUGIN_VERSION__
local result = {
    schemaVersion = 1,
    status = "PASS",
    scope = "studio-engine-plugin-runtime",
    pluginVersion = expectedPluginVersion,
    checks = {},
}

local function expect(condition, message)
    if not condition then
        error(message, 0)
    end
end

local function check(name, callback)
    local ok, detail = pcall(callback)
    table.insert(result.checks, {
        name = name,
        status = ok and "PASS" or "FAIL",
        detail = ok and tostring(detail or "verified") or tostring(detail),
    })
    if not ok then
        result.status = "FAIL"
    end
end

local runId = HttpService:GenerateGUID(false):gsub("-", ""):sub(1, 12)
local moduleRootName = "__RAIStudioAcceptanceModules_" .. runId
local scriptRootName = "__RAIStudioAcceptanceScripts_" .. runId
local metadataStageName = "STUDIO_ACCEPT_METADATA_" .. runId
local uiStageName = "STUDIO_ACCEPT_UI_" .. runId
local worldStageName = "STUDIO_ACCEPT_WORLD_" .. runId
local moduleRoot = nil
local artifactRootExisted = ReplicatedStorage:FindFirstChild("AIStudioArtifacts") ~= nil

local function cleanup()
    local scriptRoot = ReplicatedStorage:FindFirstChild(scriptRootName)
    if scriptRoot then
        scriptRoot:Destroy()
    end

    local artifactRoot = ReplicatedStorage:FindFirstChild("AIStudioArtifacts")
    if artifactRoot and artifactRoot:IsA("Folder") then
        for _, stageName in ipairs({ metadataStageName, uiStageName, worldStageName }) do
            local stage = artifactRoot:FindFirstChild(stageName)
            if stage then
                stage:Destroy()
            end
        end
        if not artifactRootExisted and #artifactRoot:GetChildren() == 0 then
            artifactRoot:Destroy()
        end
    end

    if moduleRoot then
        moduleRoot:Destroy()
        moduleRoot = nil
    end
end

local mainOk, mainError = xpcall(function()
    moduleRoot = Instance.new("Folder")
    moduleRoot.Name = moduleRootName
    moduleRoot.Parent = ServerStorage

    local function addModule(name, source)
        local module = Instance.new("ModuleScript")
        module.Name = name
        module.Source = source
        module.Parent = moduleRoot
        return module
    end

    addModule("UITreeMaterializer", __UI_TREE_MATERIALIZER_SOURCE__)
    addModule("WorldSceneMaterializer", __WORLD_SCENE_MATERIALIZER_SOURCE__)
    local artifactLoaderModule = addModule("ArtifactLoader", __ARTIFACT_LOADER_SOURCE__)

    local ArtifactLoader = nil
    check("canonical modules compile in Roblox Studio", function()
        ArtifactLoader = require(artifactLoaderModule)
        expect(type(ArtifactLoader) == "table", "ArtifactLoader did not return a module table")
        expect(type(ArtifactLoader.new) == "function", "ArtifactLoader.new is missing")
        return "exact canonical materializer sources loaded by the Studio Luau VM"
    end)

    if not ArtifactLoader then
        return
    end

    local reportedErrors = {}
    local errorReporter = {}
    function errorReporter:report(message)
        table.insert(reportedErrors, message)
    end
    local loader = ArtifactLoader.new(errorReporter)

    check("Lua artifacts preserve path classes and source", function()
        local delivery = loader:loadArtifact({
            id = "accept-lua-1",
            name = "scripts.json",
            type = "lua",
            stage = "LUA_GENERATION",
            content = {
                scripts = {
                    {
                        path = "ReplicatedStorage/" .. scriptRootName .. "/ServerProbe.server.lua",
                        content = "return 'server-probe'",
                    },
                    {
                        path = "ReplicatedStorage/" .. scriptRootName .. "/ClientProbe.client.lua",
                        content = "return 'client-probe'",
                    },
                    {
                        path = "ReplicatedStorage/" .. scriptRootName .. "/ModuleProbe.lua",
                        content = "return 'module-probe'",
                    },
                },
            },
        })
        expect(delivery.success, delivery.error or "Lua delivery failed")
        local root = ReplicatedStorage:FindFirstChild(scriptRootName)
        expect(root and root:IsA("Folder"), "generated script root is missing")
        local serverProbe = root:FindFirstChild("ServerProbe")
        local clientProbe = root:FindFirstChild("ClientProbe")
        local moduleProbe = root:FindFirstChild("ModuleProbe")
        expect(serverProbe and serverProbe:IsA("Script"), "*.server.lua was not a Script")
        expect(clientProbe and clientProbe:IsA("LocalScript"), "*.client.lua was not a LocalScript")
        expect(moduleProbe and moduleProbe:IsA("ModuleScript"), "*.lua was not a ModuleScript")
        expect(serverProbe.Source == "return 'server-probe'", "server source changed")
        expect(clientProbe.Source == "return 'client-probe'", "client source changed")
        expect(moduleProbe.Source == "return 'module-probe'", "module source changed")
        return "Script, LocalScript, and ModuleScript mappings verified"
    end)

    check("metadata delivery is stable and idempotent", function()
        local first = loader:loadArtifact({
            id = "accept-metadata-1",
            name = "acceptance.json",
            type = "metadata",
            stage = metadataStageName,
            content = { generation = 1 },
        })
        local second = loader:loadArtifact({
            id = "accept-metadata-2",
            name = "acceptance.json",
            type = "metadata",
            stage = metadataStageName,
            content = { generation = 2 },
        })
        expect(first.success and second.success, "metadata delivery failed")
        local stage = ReplicatedStorage.AIStudioArtifacts:FindFirstChild(metadataStageName)
        expect(stage and stage:IsA("Folder"), "metadata stage is missing")
        expect(#stage:GetChildren() == 1, "metadata redelivery created duplicates")
        local value = stage:FindFirstChild("acceptance.json")
        expect(value and value:IsA("StringValue"), "metadata value is missing")
        expect(value:GetAttribute("AIStudioManaged") == true, "metadata ownership is missing")
        expect(value:GetAttribute("ArtifactId") == "accept-metadata-2", "metadata identity is stale")
        expect(value.Value:find('"generation":2', 1, true) ~= nil, "metadata content is stale")
        return "stable name replaced the first delivery without an orphan"
    end)

    local screenName = "AcceptanceHUD_" .. runId
    local uiContent = {
        schemaVersion = 1,
        screens = {
            {
                screenName = screenName,
                root = {
                    className = "ScreenGui",
                    name = screenName,
                    children = {
                        {
                            className = "Frame",
                            name = "Root",
                        },
                    },
                },
            },
        },
    }

    check("UI trees materialize idempotently", function()
        local first = loader:loadArtifact({
            id = "accept-ui-1",
            name = "ui.json",
            type = "ui-layout",
            stage = uiStageName,
            content = uiContent,
        })
        local second = loader:loadArtifact({
            id = "accept-ui-2",
            name = "ui.json",
            type = "ui-layout",
            stage = uiStageName,
            content = uiContent,
        })
        expect(first.success and second.success, second.error or first.error or "UI delivery failed")
        local stage = ReplicatedStorage.AIStudioArtifacts:FindFirstChild(uiStageName)
        expect(stage and stage:IsA("Folder"), "UI stage is missing")
        expect(#stage:GetChildren() == 1, "UI redelivery created duplicate screens")
        local screen = stage:FindFirstChild(screenName)
        expect(screen and screen:IsA("ScreenGui"), "ScreenGui was not materialized")
        expect(screen:GetAttribute("AIStudioManaged") == true, "UI ownership is missing")
        expect(screen:GetAttribute("AIStudioDeliveryMode") == "design-time", "UI delivery mode is wrong")
        return "real ScreenGui tree replaced cleanly on redelivery"
    end)

    check("UI validation fails before attaching a partial tree", function()
        local validBeforeInvalid = "ValidBeforeInvalid_" .. runId
        local invalidAfterValid = "InvalidAfterValid_" .. runId
        local delivery = loader:loadArtifact({
            id = "accept-ui-invalid",
            name = "ui-invalid.json",
            type = "ui-layout",
            stage = uiStageName,
            content = {
                schemaVersion = 1,
                screens = {
                    {
                        screenName = validBeforeInvalid,
                        root = { className = "ScreenGui", name = validBeforeInvalid },
                    },
                    {
                        screenName = invalidAfterValid,
                        root = {
                            className = "ScreenGui",
                            name = invalidAfterValid,
                            children = {
                                { className = "Script", name = "ForbiddenScript" },
                            },
                        },
                    },
                },
            },
        })
        expect(not delivery.success, "forbidden Script class was accepted")
        local stage = ReplicatedStorage.AIStudioArtifacts:FindFirstChild(uiStageName)
        expect(not stage:FindFirstChild(validBeforeInvalid), "valid prefix screen was partially attached")
        expect(not stage:FindFirstChild(invalidAfterValid), "invalid screen was partially attached")
        expect(stage:FindFirstChild(screenName) ~= nil, "prior verified UI was removed by a rejected delivery")
        return "forbidden executable class rejected atomically"
    end)

    check("UI delivery preserves unowned collisions", function()
        local stage = ReplicatedStorage.AIStudioArtifacts:FindFirstChild(uiStageName)
        local collisionName = "CreatorOwned_" .. runId
        local creatorOwned = Instance.new("ScreenGui")
        creatorOwned.Name = collisionName
        creatorOwned.Parent = stage
        local delivery = loader:loadArtifact({
            id = "accept-ui-collision",
            name = "ui-collision.json",
            type = "ui-layout",
            stage = uiStageName,
            content = {
                schemaVersion = 1,
                screens = {
                    {
                        screenName = collisionName,
                        root = { className = "ScreenGui", name = collisionName },
                    },
                },
            },
        })
        expect(not delivery.success, "unowned collision was overwritten")
        expect(stage:FindFirstChild(collisionName) == creatorOwned, "creator-owned screen was replaced")
        creatorOwned:Destroy()
        return "creator-owned ScreenGui remained untouched"
    end)

    local zoneName = "AcceptanceZone_" .. runId
    local worldContent = {
        scene = {
            sceneVersion = 1,
            zones = {
                {
                    zoneName = zoneName,
                    entities = {
                        {
                            entityId = "acceptance-floor-" .. runId,
                            node = {
                                className = "Part",
                                name = "Floor",
                                properties = {
                                    Anchored = { kind = "bool", value = true },
                                    Size = { kind = "vector3", x = 8, y = 1, z = 8 },
                                },
                                attributes = {
                                    AIStudioWorldRole = { kind = "string", value = "acceptance-probe" },
                                },
                            },
                        },
                    },
                },
            },
        },
    }

    check("world scenes materialize idempotently", function()
        local first = loader:loadArtifact({
            id = "accept-world-1",
            name = "world.json",
            type = "world-scene",
            stage = worldStageName,
            content = worldContent,
        })
        local second = loader:loadArtifact({
            id = "accept-world-2",
            name = "world.json",
            type = "world-scene",
            stage = worldStageName,
            content = worldContent,
        })
        expect(first.success and second.success, second.error or first.error or "world delivery failed")
        local stage = ReplicatedStorage.AIStudioArtifacts:FindFirstChild(worldStageName)
        expect(stage and stage:IsA("Folder"), "world stage is missing")
        expect(#stage:GetChildren() == 1, "world redelivery created duplicate zones")
        local zone = stage:FindFirstChild(zoneName)
        local floor = zone and zone:FindFirstChild("Floor")
        expect(zone and zone:IsA("Folder"), "world zone is missing")
        expect(floor and floor:IsA("Part"), "world Part is missing")
        expect(floor.Anchored and floor.Size == Vector3.new(8, 1, 8), "world properties changed")
        expect(floor:GetAttribute("AIStudioWorldRole") == "acceptance-probe", "world attribute changed")
        return "real Part tree replaced cleanly on redelivery"
    end)

    check("world validation rejects executable classes atomically", function()
        local invalidZone = "InvalidWorld_" .. runId
        local delivery = loader:loadArtifact({
            id = "accept-world-invalid",
            name = "world-invalid.json",
            type = "world-scene",
            stage = worldStageName,
            content = {
                scene = {
                    sceneVersion = 1,
                    zones = {
                        {
                            zoneName = invalidZone,
                            entities = {
                                {
                                    entityId = "forbidden-script-" .. runId,
                                    node = { className = "Script", name = "ForbiddenScript" },
                                },
                            },
                        },
                    },
                },
            },
        })
        expect(not delivery.success, "world Script class was accepted")
        local stage = ReplicatedStorage.AIStudioArtifacts:FindFirstChild(worldStageName)
        expect(not stage:FindFirstChild(invalidZone), "invalid world zone was partially attached")
        expect(stage:FindFirstChild(zoneName) ~= nil, "prior verified world was removed by a rejected delivery")
        return "world allowlist rejected executable content without partial attachment"
    end)

    check("acceptance fixtures clean up their DataModel changes", function()
        cleanup()
        expect(not ReplicatedStorage:FindFirstChild(scriptRootName), "generated script fixture remained")
        expect(not ServerStorage:FindFirstChild(moduleRootName), "injected module fixture remained")
        local artifactRoot = ReplicatedStorage:FindFirstChild("AIStudioArtifacts")
        if artifactRoot and artifactRoot:IsA("Folder") then
            expect(not artifactRoot:FindFirstChild(metadataStageName), "metadata fixture remained")
            expect(not artifactRoot:FindFirstChild(uiStageName), "UI fixture remained")
            expect(not artifactRoot:FindFirstChild(worldStageName), "world fixture remained")
        end
        return "all acceptance-owned instances removed"
    end)
end, debug.traceback)

if not mainOk then
    result.status = "FAIL"
    table.insert(result.checks, {
        name = "acceptance runner completed",
        status = "FAIL",
        detail = tostring(mainError),
    })
end

pcall(cleanup)
print("RAI_STUDIO_ACCEPTANCE_RESULT:" .. HttpService:JSONEncode(result))
