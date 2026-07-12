import type { GameBlueprint } from "../types/blueprint";
import type { GameGenerationResult } from "../types/game-generation-result";
import type {
  GameplaySystemDefinition,
  RobloxLuaCodeBlock,
  RobloxNPCDefinition,
  RobloxWorldDefinition,
} from "../types/game-generation-result";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  try {
    if (typeof value !== "object" || value === null) return String(value);
    return JSON.stringify(value, Object.keys(value as any).sort());
  } catch {
    return String(value);
  }
}

function toLuaBlocks(input: unknown): RobloxLuaCodeBlock[] {
  // Accept a few shapes:
  // - Array<{name, code}>
  // - { server: Array, client: Array, shared: Array }
  // - { modules: Array<{name, code}> } (fallback)
  if (Array.isArray(input)) {
    return input
      .map((it) => {
        if (isRecord(it)) {
          const name = typeof it.name === "string" ? it.name : "Lua Script";
          const code =
            typeof it.code === "string" ? it.code : stableStringify(it.code);
          return { name, code };
        }
        return { name: "Lua Script", code: stableStringify(it) };
      })
      .slice(0, 200);
  }

  if (isRecord(input)) {
    const maybeModules = (input as any).modules;
    if (Array.isArray(maybeModules)) return toLuaBlocks(maybeModules);

    // If it's already a single {name, code}
    if (typeof (input as any).code !== "undefined") {
      return [
        {
          name:
            typeof (input as any).name === "string"
              ? (input as any).name
              : "Lua Script",
          code:
            typeof (input as any).code === "string"
              ? (input as any).code
              : stableStringify((input as any).code),
        },
      ];
    }
  }

  if (typeof input === "string") {
    return [{ name: "Lua Script", code: input }];
  }

  if (typeof input === "undefined") return [];

  // Last resort: wrap whatever came back.
  return [{ name: "Lua Script", code: stableStringify(input) }];
}

function normalizeScripts(pipelineOutputs: Record<string, unknown>) {
  const lua =
    pipelineOutputs.lua_generator ??
    pipelineOutputs.luaGenerator ??
    pipelineOutputs.lua;
  // allow orchestrator to provide full code packs
  const orchestrator =
    pipelineOutputs.orchestrator ??
    pipelineOutputs.final ??
    pipelineOutputs["final"];

  const candidates: unknown[] = [lua, orchestrator].filter(Boolean);

  // default buckets
  const server: RobloxLuaCodeBlock[] = [];
  const client: RobloxLuaCodeBlock[] = [];
  const shared: RobloxLuaCodeBlock[] = [];

  for (const cand of candidates) {
    if (isRecord(cand)) {
      if (Array.isArray((cand as any).server))
        server.push(...toLuaBlocks((cand as any).server));
      if (Array.isArray((cand as any).client))
        client.push(...toLuaBlocks((cand as any).client));
      if (Array.isArray((cand as any).shared))
        shared.push(...toLuaBlocks((cand as any).shared));

      // fallback: modules
      if (server.length === 0 && Array.isArray((cand as any).modules)) {
        server.push(...toLuaBlocks((cand as any).modules));
      }
    } else {
      // string/array fallback
      server.push(...toLuaBlocks(cand));
    }
  }

  // Deterministic order by name.
  server.sort((a, b) => a.name.localeCompare(b.name));
  client.sort((a, b) => a.name.localeCompare(b.name));
  shared.sort((a, b) => a.name.localeCompare(b.name));

  // De-dupe by name+code
  const dedupe = (arr: RobloxLuaCodeBlock[]) => {
    const seen = new Set<string>();
    const out: RobloxLuaCodeBlock[] = [];
    for (const it of arr) {
      const key = `${it.name}::${it.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  };

  return {
    server: dedupe(server).slice(0, 200),
    client: dedupe(client).slice(0, 200),
    shared: dedupe(shared).slice(0, 200),
  };
}

function normalizeWorld(
  pipelineOutputs: Record<string, unknown>,
): RobloxWorldDefinition {
  const arch = pipelineOutputs.roblox_architect ?? pipelineOutputs.architecture;
  const designer = pipelineOutputs.game_designer ?? pipelineOutputs.gameplay;
  const orchestrator = pipelineOutputs.orchestrator ?? pipelineOutputs.final;

  const base: RobloxWorldDefinition = {
    name: undefined,
    description: undefined,
    places: undefined,
    models: undefined,
    systemsHooks: undefined,
  };

  const candidates = [orchestrator, arch, designer].filter(
    Boolean,
  ) as unknown[];

  for (const cand of candidates) {
    if (!isRecord(cand)) continue;
    // Prefer explicit world fields if present.
    if (
      typeof (cand as any).world === "object" &&
      (cand as any).world !== null
    ) {
      const w = (cand as any).world;
      Object.assign(base, w);
      continue;
    }

    // Otherwise map some common fields.
    if (typeof (cand as any).name === "string" && !base.name)
      base.name = (cand as any).name;
    if (typeof (cand as any).description === "string" && !base.description)
      base.description = (cand as any).description;

    if (Array.isArray((cand as any).places) && !base.places)
      base.places = (cand as any).places;
    if (Array.isArray((cand as any).models) && !base.models)
      base.models = (cand as any).models;

    if (isRecord((cand as any).systemsHooks) && !base.systemsHooks)
      base.systemsHooks = (cand as any).systemsHooks;
  }

  return base;
}

function normalizeNPCs(
  pipelineOutputs: Record<string, unknown>,
): RobloxNPCDefinition[] {
  const npcCandidates = [
    pipelineOutputs.orchestrator,
    pipelineOutputs.game_designer,
    pipelineOutputs.requirements,
    pipelineOutputs.planner,
    pipelineOutputs["final"],
  ].filter(Boolean);

  for (const cand of npcCandidates) {
    if (!isRecord(cand)) continue;
    const npcs =
      (cand as any).npcs ?? (cand as any).NPCs ?? (cand as any).npc_definitions;
    if (Array.isArray(npcs)) {
      const out: RobloxNPCDefinition[] = npcs
        .map((n: any) => {
          if (isRecord(n)) {
            return {
              id:
                typeof n.id === "string"
                  ? n.id
                  : stableStringify(n.id ?? n.name ?? "npc"),
              role:
                typeof n.role === "string"
                  ? n.role
                  : stableStringify(n.role ?? n.type ?? "npc"),
              dialogue: typeof n.dialogue === "string" ? n.dialogue : undefined,
              behaviors: isRecord(n.behaviors)
                ? (n.behaviors as any)
                : undefined,
              spawn: isRecord(n.spawn) ? (n.spawn as any) : undefined,
            };
          }
          return {
            id: stableStringify(n),
            role: "npc",
          };
        })
        .slice(0, 200);

      // deterministic order
      out.sort((a, b) => a.id.localeCompare(b.id));
      return out;
    }
  }

  return [];
}

function normalizeGameplaySystems(pipelineOutputs: Record<string, unknown>): {
  systems: GameplaySystemDefinition[];
} {
  const designer = pipelineOutputs.game_designer ?? pipelineOutputs.gameplay;
  const orchestrator = pipelineOutputs.orchestrator ?? pipelineOutputs.final;

  const systems: GameplaySystemDefinition[] = [];

  const candidates = [orchestrator, designer].filter(Boolean);
  for (const cand of candidates) {
    if (!isRecord(cand)) continue;
    const arr =
      (cand as any).systems ??
      (cand as any).gameplaySystems ??
      (cand as any).gameplay_systems;
    if (Array.isArray(arr)) {
      for (const s of arr) {
        if (isRecord(s)) {
          const name =
            typeof (s as any).name === "string"
              ? (s as any).name
              : stableStringify(s);
          systems.push({
            name,
            description:
              typeof (s as any).description === "string"
                ? (s as any).description
                : undefined,
            config: isRecord((s as any).config) ? (s as any).config : undefined,
          });
        }
      }
    }
  }

  systems.sort((a, b) => a.name.localeCompare(b.name));
  return { systems: systems.slice(0, 100) };
}

export function aggregateToGameGenerationResult(
  pipelineOutputs: Record<string, unknown>,
  args: { blueprint: GameBlueprint; executionId: string },
): GameGenerationResult {
  const { blueprint, executionId } = args;

  const scripts = normalizeScripts(pipelineOutputs);
  const world = normalizeWorld(pipelineOutputs);
  const npcs = normalizeNPCs(pipelineOutputs);
  const gameplaySystems = normalizeGameplaySystems(pipelineOutputs);

  const agentsInvolved: string[] = [
    "requirements",
    "planner",
    "game_designer",
    "roblox_architect",
    "lua_generator",
    "ui_generator",
    "asset_planner",
    "orchestrator",
  ];

  return {
    scripts,
    world,
    npcs,
    gameplaySystems,
    metadata: {
      executionId,
      blueprintId: blueprint.id,
      generatedAt: new Date(),
      agentsInvolved,
      sourcePipelineOutputs: pipelineOutputs,
    },
    blueprint,
  };
}
