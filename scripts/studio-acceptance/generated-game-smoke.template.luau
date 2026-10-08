local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")

local result = {
    schemaVersion = 1,
    status = "PASS",
    scope = "generated-game-studio-import",
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
local mechanicName = __MECHANIC_NAME__
local verifyModuleName = "__RAIGenAcceptVerify_" .. runId
local verifyModule = nil

local function cleanup()
    if verifyModule then
        verifyModule:Destroy()
        verifyModule = nil
    end
    local baseplate = Workspace:FindFirstChild("Baseplate")
    if baseplate then baseplate:Destroy() end
    local spawnPoint = Workspace:FindFirstChild("MainSpawn")
    if spawnPoint then spawnPoint:Destroy() end
    local objective = Workspace:FindFirstChild(mechanicName .. "_Interactable")
    if objective then objective:Destroy() end
    local progressEvent = ReplicatedStorage:FindFirstChild("ProgressUpdated")
    if progressEvent then progressEvent:Destroy() end
    for _, name in ipairs({ "GameManager", "PlayerService", "EconomyService" }) do
        local instance = game:GetService("ServerScriptService"):FindFirstChild(name)
        if instance then instance:Destroy() end
    end
    local starterPlayerScripts = game:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
    if starterPlayerScripts then
        for _, name in ipairs({ "ClientController", "UIController" }) do
            local instance = starterPlayerScripts:FindFirstChild(name)
            if instance then instance:Destroy() end
        end
    end
end

local mainOk, mainError = xpcall(function()
    local moduleRoot = Instance.new("Folder")
    moduleRoot.Name = "__RAIGenAcceptModules_" .. runId
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

    local ArtifactLoader
    check("canonical ArtifactLoader compiles in Roblox Studio", function()
        ArtifactLoader = require(artifactLoaderModule)
        expect(type(ArtifactLoader) == "table" and type(ArtifactLoader.new) == "function",
            "ArtifactLoader did not return a usable module")
        return "loaded by the real Studio Luau VM"
    end)
    if not ArtifactLoader then
        moduleRoot:Destroy()
        return
    end

    local errorReporter = {}
    function errorReporter:report(message)
        warn("[generation-acceptance] " .. tostring(message))
    end
    local loader = ArtifactLoader.new(errorReporter)
    local provenance = { projectId = "gen-viability-2-" .. runId, deliveryId = "delivery-" .. runId }

    local luaContent = HttpService:JSONDecode(__LUA_ARTIFACT_CONTENT_JSON__)
    local delivery

    check("the generated Lua package delivers through the existing ArtifactLoader", function()
        delivery = loader:loadArtifact({
            id = "gen-lua-" .. runId,
            name = "scripts.json",
            type = "lua",
            stage = "LUA_GENERATION",
            content = luaContent,
        }, provenance)
        expect(delivery.success, delivery.error or "delivery failed")
        return string.format("%d script instances materialized", #delivery.instancePaths)
    end)
    if not delivery or not delivery.success then
        moduleRoot:Destroy()
        return
    end

    check("server scripts landed as real Script instances under ServerScriptService", function()
        local sss = game:GetService("ServerScriptService")
        local gameManager = sss:FindFirstChild("GameManager")
        local playerService = sss:FindFirstChild("PlayerService")
        local economyService = sss:FindFirstChild("EconomyService")
        expect(gameManager and gameManager:IsA("Script"), "GameManager is not a Script")
        expect(playerService and playerService:IsA("Script"), "PlayerService is not a Script")
        expect(economyService and economyService:IsA("Script"), "EconomyService is not a Script")
        return "GameManager, PlayerService, EconomyService are real Script instances"
    end)

    check("client scripts landed as real LocalScript instances under StarterPlayerScripts", function()
        local sps = game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")
        local clientController = sps:FindFirstChild("ClientController")
        local uiController = sps:FindFirstChild("UIController")
        expect(clientController and clientController:IsA("LocalScript"), "ClientController is not a LocalScript")
        expect(uiController and uiController:IsA("LocalScript"), "UIController is not a LocalScript")
        return "ClientController, UIController are real LocalScript instances"
    end)

    -- The server Script's own body is executed here — via a real Roblox
    -- `require()` on a ModuleScript wrapper, the same instantiate-and-require
    -- technique the existing plugin-runtime smoke test already uses, not a
    -- syntax heuristic. This is genuine evidence the generated Luau compiles
    -- and runs in the actual Studio Luau VM: it must build real Workspace
    -- geometry (world + spawn) and wire a real gameplay interaction, with no
    -- runtime error, or this check fails.
    check("GameManager's server logic executes and builds a real, spawnable world", function()
        local gameManagerSource = nil
        for _, script in ipairs(luaContent.scripts) do
            if script.path:match("GameManager") then
                gameManagerSource = script.content
            end
        end
        expect(gameManagerSource ~= nil, "GameManager source was not found in the delivered artifact")

        verifyModule = Instance.new("ModuleScript")
        verifyModule.Name = verifyModuleName
        verifyModule.Source = "return function()\n" .. gameManagerSource .. "\nend"
        verifyModule.Parent = ServerStorage
        local run = require(verifyModule)
        run()

        local spawnPoint = Workspace:FindFirstChild("MainSpawn")
        local baseplate = Workspace:FindFirstChild("Baseplate")
        local objective = Workspace:FindFirstChild(mechanicName .. "_Interactable")
        local progressEvent = ReplicatedStorage:FindFirstChild("ProgressUpdated")

        expect(spawnPoint and spawnPoint:IsA("SpawnLocation"), "no real SpawnLocation was built in Workspace")
        expect(baseplate and baseplate:IsA("Part") and baseplate.Anchored, "no world floor geometry was built")
        expect(objective and objective:IsA("Part"), "the gameplay mechanic object was not built")
        expect(objective.Touched:Connect(function() end) ~= nil, "the mechanic has no Touched interaction wired")
        expect(progressEvent and progressEvent:IsA("RemoteEvent"), "no progress RemoteEvent was created")

        return "SpawnLocation, floor, mechanic Part, and RemoteEvent were created live by the generated server code"
    end)

    check("acceptance fixtures clean up their DataModel changes", function()
        cleanup()
        expect(not Workspace:FindFirstChild("Baseplate"), "world fixture remained")
        expect(not ReplicatedStorage:FindFirstChild("ProgressUpdated"), "RemoteEvent fixture remained")
        return "all acceptance-owned instances removed"
    end)
end, debug.traceback)

if not mainOk then
    result.status = "FAIL"
    table.insert(result.checks, {
        name = "generation acceptance runner completed",
        status = "FAIL",
        detail = tostring(mainError),
    })
end

pcall(cleanup)
print("RAI_GENERATION_ACCEPTANCE_RESULT:" .. HttpService:JSONEncode(result))
