/**
 * GenerationArtifactRecorder.provenance.test.ts
 *
 * GEN-ARTIFACT-INTEGRITY-1.
 *
 * ROOT CAUSE, PROVEN: `LuaGeneratorAgent`'s real output is always
 * `{ lua_generator: { server, client, shared, generationMode, mechanicNames,
 * ... } }` — never a top-level `scripts` array. `normalizeLuaArtifactContent`
 * used to read the whole output only to discard it, `return
 * Array.isArray(output.scripts) ? output : { scripts }` — and since
 * `output.scripts` is never an array for this shape, every durable
 * `LUA_GENERATION` artifact was rebuilt as bare `{ scripts }`.
 * `generationMode` and every other field on `output.lua_generator` were lost
 * before the artifact ever reached the store. The first test below proves
 * this directly against the function as it exists now.
 *
 * These fixtures then prove the fix: provenance and compact semantic
 * evidence (objective identity/count) now survive normalization, store,
 * restart, and package delivery — for all four `generationMode` values, for
 * unknown/malformed provenance (never silently relabelled `"primary"`), and
 * for the legacy `{ scripts }` shape (no provenance invented for a record
 * that never stated any) — while `scripts` itself, and the STUDIO-1A/
 * PIPELINE-1B rejected-generation-commits-nothing invariant, are unchanged.
 */

import { describe, expect, it, vi } from "vitest";
import { ArtifactStore } from "../../../pipeline/v2";
import { InMemoryStorageProvider } from "../../../platform/storage/StorageProvider";
import type { TaskNode } from "../../../planning/model/TaskGraph";
import { normalizeLuaScripts } from "../../../types/playableLua";
import { LuaGeneratorAgent } from "../../../agents/implementations/LuaGeneratorAgent";
import {
  GenerationArtifactRecorder,
  normalizeLuaArtifactContent,
  type StudioLuaArtifactContent,
} from "../GenerationArtifactRecorder";

const PROJECT_ID = "gen-artifact-integrity-1-project";

/** Minimal but playable server/client Lua, for the legacy {scripts} fixtures. */
const LEGACY_PLAYABLE_SERVER = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local progress = Instance.new("RemoteEvent")
progress.Name = "OrbProgress"
progress.Parent = ReplicatedStorage
local arena = Instance.new("Folder")
arena.Name = "GeneratedArena"
arena.Parent = workspace
local spawnPad = Instance.new("SpawnLocation")
spawnPad.Size = Vector3.new(12, 1, 12)
spawnPad.Position = Vector3.new(0, 1, 0)
spawnPad.Anchored = true
spawnPad.Parent = arena
local orb = Instance.new("Part")
orb.Name = "Orb1"
orb.Anchored = true
orb.Position = Vector3.new(6, 3, 0)
orb.Parent = arena
orb.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if not player then return end
  progress:FireAllClients(1, 1)
end)
`;
const LEGACY_PLAYABLE_CLIENT = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Name = "OrbHud"
gui.Parent = playerGui
local label = Instance.new("TextLabel")
label.Text = "Orbs: 0/1"
label.Parent = gui
local progress = ReplicatedStorage:WaitForChild("OrbProgress")
progress.OnClientEvent:Connect(function(score, goal)
  label.Text = "Orbs: " .. tostring(score) .. "/" .. tostring(goal)
end)
`;
function legacyPlayableScripts(): Array<{ path: string; content: string }> {
  return [
    {
      path: "ServerScriptService/OrbArena.server.lua",
      content: LEGACY_PLAYABLE_SERVER,
    },
    {
      path: "StarterPlayerScripts/OrbHud.client.lua",
      content: LEGACY_PLAYABLE_CLIENT,
    },
  ];
}

function node(agent: string, output: Record<string, unknown>): TaskNode {
  return {
    id: `task-${agent}`,
    agent,
    type: "stage",
    input: {},
    dependencies: [],
    status: "done",
    priority: 1,
    output,
  };
}

const richInput = {
  blueprint: {
    name: "Ember Reach",
    description: "Mine, craft and trade your way across the reach.",
  },
  architecture: {
    services: ["WorldService", { name: "EconomyService" }],
  },
  gameplay: {
    mechanics: [
      { name: "mining", description: "Dig ore from deposits" },
      { name: "crafting", description: "Turn ore into gear" },
      { name: "trading", description: "Sell gear at the outpost" },
    ],
    progression: { loop: "explore → gather → craft → trade" },
    balance: { economyOrScoring: "gems earned per completed trade route" },
  },
};

const unplayable = JSON.stringify({
  lua_generator: {
    server: [{ name: "World.server.lua", code: "-- TODO implement here" }],
    client: [{ name: "HUD.client.lua", code: "-- placeholder" }],
    shared: [],
  },
});

/**
 * The real agent's own successful output for each generationMode tier.
 *
 * "primary" requires a genuinely-configured LLM that succeeds on the first
 * call — stub mode (no LLM at all) is a *different*, unstamped path
 * (`playableFallback` returned directly from `!this.llm`), not the primary
 * tier, and correctly carries no `generationMode` at all (proven separately
 * below as the legacy/absent case).
 */
async function luaGeneratorOutput(
  mode: "primary" | "repaired" | "constrained_repair" | "safe_repair",
): Promise<Record<string, unknown>> {
  const richResponse = JSON.stringify(
    (await new LuaGeneratorAgent().execute(richInput)).data,
  );
  const callsBeforeSuccess = {
    primary: 0,
    repaired: 1,
    constrained_repair: 2,
    safe_repair: 3,
  }[mode];
  const generate = vi.fn();
  for (let i = 0; i < callsBeforeSuccess; i++) {
    generate.mockResolvedValueOnce(unplayable);
  }
  if (mode !== "safe_repair") generate.mockResolvedValueOnce(richResponse);
  else generate.mockResolvedValue(unplayable);

  const agent = new LuaGeneratorAgent();
  agent.setLLM({ generate });
  const result = await agent.execute(richInput);
  if (!result.success)
    throw new Error(`fixture generation failed: ${result.error}`);
  return result.data as Record<string, unknown>;
}

function gameDesignerNode(): TaskNode {
  return node("game_designer", {
    gameplay: {
      mechanics: [
        { name: "mining" },
        { name: "crafting" },
        { name: "trading" },
      ],
      balance: { winCondition: "Complete every trade route" },
    },
  });
}

function architectNode(): TaskNode {
  return node("roblox_architect", {
    architecture: { services: { WorldService: "spawns" } },
  });
}

function luaContent(
  recorded: Awaited<ReturnType<GenerationArtifactRecorder["record"]>>,
): StudioLuaArtifactContent {
  const artifact = recorded.find((a) => a.stage === "LUA_GENERATION");
  if (!artifact) throw new Error("No LUA_GENERATION artifact was recorded");
  return artifact.content as StudioLuaArtifactContent;
}

describe("GEN-ARTIFACT-INTEGRITY-1 — normalizeLuaArtifactContent preserves provenance", () => {
  it("root cause, proven directly: a lua_generator-shaped output's generationMode/mechanicNames survive normalization", async () => {
    const output = await luaGeneratorOutput("primary");
    const generated = output.lua_generator as Record<string, unknown>;
    expect(generated.generationMode).toBe("primary");
    expect(Array.isArray(generated.mechanicNames)).toBe(true);

    const content = normalizeLuaArtifactContent(
      output,
    ) as StudioLuaArtifactContent;

    // Proves the fix: before GEN-ARTIFACT-INTEGRITY-1 this function returned
    // literally `{ scripts }` for any `lua_generator`-shaped output (since
    // `output.scripts` is never an array on that shape) — every key other
    // than `scripts` was discarded here, unconditionally.
    expect(content.generationMode).toBe("primary");
    expect(content.objectiveNames).toEqual(["mining", "crafting", "trading"]);
    expect(content.objectiveCount).toBe(3);
    expect(Object.keys(content).sort()).not.toEqual(["scripts"]);
  });

  it("scripts are byte-identical to what normalizeLuaScripts independently computes (Studio materializer path unchanged)", async () => {
    const output = await luaGeneratorOutput("primary");
    const content = normalizeLuaArtifactContent(
      output,
    ) as StudioLuaArtifactContent;
    expect(content.scripts).toEqual(normalizeLuaScripts(output));
  });

  it("malformed/unknown generationMode is omitted, never silently read as primary", async () => {
    const output = await luaGeneratorOutput("primary");
    const generated = output.lua_generator as Record<string, unknown>;
    generated.generationMode = "not-a-real-mode";

    const content = normalizeLuaArtifactContent(
      output,
    ) as StudioLuaArtifactContent;

    expect(content.generationMode).toBeUndefined();
    expect(content.scripts.length).toBeGreaterThan(0);
  });

  it("a legacy {scripts} artifact with no lua_generator carries no invented provenance", () => {
    const output = { scripts: legacyPlayableScripts() };

    const content = normalizeLuaArtifactContent(
      output,
    ) as StudioLuaArtifactContent;

    expect(content).toBe(output); // passthrough — RepairEngine/legacy adapter shape
    expect(
      (content as StudioLuaArtifactContent).generationMode,
    ).toBeUndefined();
    expect(
      (content as StudioLuaArtifactContent).objectiveNames,
    ).toBeUndefined();
  });
});

describe("GEN-ARTIFACT-INTEGRITY-1 — GenerationArtifactRecorder.record end to end", () => {
  it.each([
    "primary",
    "repaired",
    "constrained_repair",
    "safe_repair",
  ] as const)(
    "generationMode %s survives record -> store -> package/read",
    async (mode) => {
      const luaOutput = await luaGeneratorOutput(mode);
      const store = new ArtifactStore(new InMemoryStorageProvider());
      const recorder = new GenerationArtifactRecorder(store);

      const recorded = await recorder.record(
        `exec-${mode}`,
        [gameDesignerNode(), architectNode(), node("lua_generator", luaOutput)],
        PROJECT_ID,
      );

      const content = luaContent(recorded);
      expect(content.generationMode).toBe(mode);
      expect(content.objectiveNames).toEqual(["mining", "crafting", "trading"]);
      expect(content.objectiveCount).toBe(3);

      // Package delivery: the same artifact, reached through the durable
      // package commit, not just the in-process `recorded` array.
      const commit = store.getPackageCommit(PROJECT_ID, `exec-${mode}`);
      expect(commit).not.toBeNull();
      const delivered = store.getDeliverableArtifacts(
        PROJECT_ID,
        `exec-${mode}`,
      );
      const deliveredLua = delivered.find((a) => a.stage === "LUA_GENERATION");
      expect(
        (deliveredLua?.content as StudioLuaArtifactContent).generationMode,
      ).toBe(mode);
    },
  );

  it("restart: a fresh ArtifactStore reading only durable storage still sees generationMode", async () => {
    const storage = new InMemoryStorageProvider();
    const before = new ArtifactStore(storage);
    const recorder = new GenerationArtifactRecorder(before);

    const luaOutput = await luaGeneratorOutput("constrained_repair");
    await recorder.record(
      "restart-exec",
      [gameDesignerNode(), architectNode(), node("lua_generator", luaOutput)],
      PROJECT_ID,
    );

    // Simulated restart: a new store instance, same durable storage, no
    // in-memory state carried over from `before`.
    const after = new ArtifactStore(storage);

    const delivered = after.getDeliverableArtifacts(PROJECT_ID, "restart-exec");
    const luaArtifact = delivered.find((a) => a.stage === "LUA_GENERATION");
    expect(luaArtifact).toBeDefined();
    const content = luaArtifact!.content as StudioLuaArtifactContent;
    expect(content.generationMode).toBe("constrained_repair");
    expect(content.objectiveNames).toEqual(["mining", "crafting", "trading"]);

    const commit = after.getPackageCommit(PROJECT_ID, "restart-exec");
    expect(commit).not.toBeNull();
  });

  it("VALIDATION and the package still bind to the exact LUA_GENERATION artifact/hash", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const recorder = new GenerationArtifactRecorder(store);
    const luaOutput = await luaGeneratorOutput("primary");

    const recorded = await recorder.record(
      "lineage-exec",
      [gameDesignerNode(), architectNode(), node("lua_generator", luaOutput)],
      PROJECT_ID,
    );

    const luaArtifact = recorded.find((a) => a.stage === "LUA_GENERATION")!;
    const validationArtifact = recorded.find((a) => a.stage === "VALIDATION")!;
    const luaEdge = validationArtifact.dependencies?.find(
      (dep) => dep.stage === "LUA_GENERATION",
    );

    expect(luaEdge?.artifactId).toBe(luaArtifact.id);
    expect(luaEdge?.contentHash).toBe(luaArtifact.contentHash);

    const commit = store.getPackageCommit(PROJECT_ID, "lineage-exec");
    expect(
      commit?.artifacts.some((ref) => ref.artifactId === luaArtifact.id),
    ).toBe(true);
  });

  it("a rejected/unplayable generation still commits no deliverable LUA_GENERATION artifact or package", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const recorder = new GenerationArtifactRecorder(store);

    await expect(
      recorder.record(
        "rejected-exec",
        [
          node("game_designer", { gameplay: { mechanics: [] } }),
          node("lua_generator", {
            scripts: [
              {
                path: "ServerScriptService/Stub.server.lua",
                content: "print('nothing here')\n",
              },
            ],
          }),
        ],
        PROJECT_ID,
      ),
    ).rejects.toThrow(/failed deterministic validation/);

    expect(store.getPackageCommit(PROJECT_ID, "rejected-exec")).toBeNull();
    expect(
      store
        .getDeliverableArtifacts(PROJECT_ID, "rejected-exec")
        .map((a) => a.stage),
    ).not.toContain("LUA_GENERATION");
  });

  it("compatibility: a legacy {scripts}-shaped lua_generator node records with no provenance, and still delivers", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const recorder = new GenerationArtifactRecorder(store);

    const recorded = await recorder.record(
      "legacy-shape-exec",
      [
        gameDesignerNode(),
        architectNode(),
        node("lua_generator", { scripts: legacyPlayableScripts() }),
      ],
      PROJECT_ID,
    );

    const content = luaContent(recorded);
    expect(content.generationMode).toBeUndefined();
    expect(content.objectiveNames).toBeUndefined();
    expect(content.scripts).toHaveLength(2);

    expect(
      store.getPackageCommit(PROJECT_ID, "legacy-shape-exec"),
    ).not.toBeNull();
  });
});
