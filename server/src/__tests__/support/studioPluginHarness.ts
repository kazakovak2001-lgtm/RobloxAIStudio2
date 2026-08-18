/**
 * Runs the real Studio plugin source against a stubbed Roblox instance tree.
 *
 * MAR-002. The plugin had no executable test path. Everything claimed about its
 * ownership rules was a string search over its source, which cannot show that a
 * creator's script survives a generation wanting the same name, or that an
 * unknown script root is refused rather than quietly redirected.
 *
 * This loads the plugin's own Lua — not a reimplementation of it — so a fix has
 * to hold in the file that ships.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LuaFactory, type LuaEngine } from "wasmoon";

const pluginRoot = resolve(process.cwd(), "studio-plugin");
const supportRoot = resolve(process.cwd(), "server/src/__tests__/support");

/** Plugin modules reachable through the stubbed `script.Parent` chain. */
const MODULES = [
  "utils/ArtifactLoader",
  "utils/UITreeMaterializer",
  "utils/WorldSceneMaterializer",
  "services/SyncManager",
  "core/Config",
] as const;

export interface PluginHarness {
  engine: LuaEngine;
  /** Evaluate Lua against the loaded plugin, returning whatever it returns. */
  run: (lua: string) => Promise<unknown>;
  close: () => void;
}

/**
 * `require(script.Parent.X)` is the plugin's module syntax. The stub resolves it
 * through a table keyed by module name rather than by walking a real instance
 * tree, because the tree the plugin builds is the thing under test and reusing
 * it for module loading would tangle the two.
 */
export async function loadStudioPlugin(): Promise<PluginHarness> {
  const factory = new LuaFactory();
  const engine = await factory.createEngine();

  const stubSource = readFileSync(
    resolve(supportRoot, "robloxStub.lua"),
    "utf8",
  );

  const moduleSources = MODULES.map((name) => {
    const source = readFileSync(
      resolve(pluginRoot, "src", `${name}.lua`),
      "utf8",
    );
    const key = name.split("/").pop() as string;
    return { key, source };
  });

  await engine.doString(`
local stub = (function()
${stubSource}
end)()

Instance = stub.Instance
game = stub.game
_G.__stub = stub

local loaded = {}
local pending = {}

-- Plugin modules address each other by walking \`script.Parent\` chains of
-- varying depth. The chain itself is not under test, so each step returns a
-- proxy remembering the last segment, and require resolves by that name.
local function makeHandle(name)
  return setmetatable({}, {
    __index = function(_, key) return makeHandle(key) end,
    __call = function() return name end,
    __tostring = function() return name end,
    __name = name,
  })
end

local function handleName(target)
  if type(target) == "string" then return target end
  local meta = getmetatable(target)
  return meta and meta.__name or nil
end

local function makeScriptHandle()
  return makeHandle("script")
end

function require(target)
  local name = handleName(target)
  if loaded[name] ~= nil then return loaded[name] end
  local chunk = pending[name]
  if not chunk then
    error("harness: no such plugin module: " .. tostring(name))
  end
  script = makeScriptHandle()
  loaded[name] = chunk()
  return loaded[name]
end

_G.__definePluginModule = function(name, chunk)
  pending[name] = chunk
end
`);

  for (const { key, source } of moduleSources) {
    await engine.doString(`
_G.__definePluginModule(${JSON.stringify(key)}, function()
${source}
end)
`);
  }

  return {
    engine,
    run: (lua: string) => engine.doString(lua),
    close: () => engine.global.close(),
  };
}
