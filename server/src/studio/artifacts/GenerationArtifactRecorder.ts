import type { TaskNode } from "../../planning/model/TaskGraph";
import {
  ArtifactStore,
  type PipelineArtifact,
  type StageName,
} from "../../pipeline/v2";

const AGENT_STAGE_MAP: Readonly<Record<string, StageName>> = {
  requirements: "REQUIREMENTS",
  planner: "REQUEST",
  game_designer: "GAME_DESIGN",
  roblox_architect: "ARCHITECTURE",
  asset_planner: "ASSET_PLANNING",
  lua_generator: "LUA_GENERATION",
  ui_generator: "UI_GENERATION",
  tester: "VALIDATION",
  performance: "OPTIMIZATION",
  documentation: "DOCUMENTATION",
  orchestrator: "EXPORT",
};

interface StudioLuaScript {
  path: string;
  content: string;
}

interface StudioLuaArtifactContent {
  scripts: StudioLuaScript[];
}

/**
 * Stores real outputs from the canonical PlanExecutor under the durable
 * generation execution ID. Unmapped or incomplete tasks are intentionally
 * skipped instead of being converted into synthetic Studio artifacts.
 */
export class GenerationArtifactRecorder {
  constructor(private readonly artifactStore: ArtifactStore) {}

  record(executionId: string, nodes: readonly TaskNode[]): PipelineArtifact[] {
    const recorded: PipelineArtifact[] = [];

    for (const node of nodes) {
      const stage = getArtifactStage(node.agent);
      if (!stage || node.status !== "done" || node.output === undefined)
        continue;

      const content =
        stage === "LUA_GENERATION"
          ? normalizeLuaArtifactContent(node.output)
          : node.output;

      recorded.push(
        this.artifactStore.store(executionId, stage, node.agent, content),
      );
    }

    return recorded;
  }
}

export function getArtifactStage(agent: string): StageName | undefined {
  return AGENT_STAGE_MAP[agent];
}

export function normalizeLuaArtifactContent(
  output: unknown,
): StudioLuaArtifactContent | Record<string, unknown> {
  if (!isRecord(output)) {
    throw new Error("Lua generator output must be an object");
  }

  if (Array.isArray(output.scripts) && output.scripts.length > 0) {
    validateCanonicalScripts(output.scripts);
    return output;
  }

  const legacy = isRecord(output.lua_generator)
    ? output.lua_generator
    : undefined;
  const scripts = [
    ...normalizeLegacyGroup(legacy?.server, "ServerScriptService", "server"),
    ...normalizeLegacyGroup(legacy?.client, "StarterPlayerScripts", "client"),
    ...normalizeLegacyGroup(
      legacy?.shared,
      "ReplicatedStorage/Shared",
      "module",
    ),
    ...normalizeLegacyGroup(
      legacy?.modules,
      "ReplicatedStorage/Shared",
      "module",
    ),
  ];

  if (scripts.length === 0) {
    throw new Error(
      "Lua generator output must produce a non-empty Studio scripts array",
    );
  }

  assertUniquePaths(scripts);
  return { scripts };
}

function validateCanonicalScripts(scripts: unknown[]): void {
  for (const [index, script] of scripts.entries()) {
    if (!isRecord(script)) {
      throw new Error(`Lua script ${index + 1} must be an object`);
    }
    if (!isNonEmptyString(script.path)) {
      throw new Error(`Lua script ${index + 1} requires a non-empty path`);
    }
    if (typeof script.content !== "string") {
      throw new Error(`Lua script ${index + 1} requires string content`);
    }
  }

  assertUniquePaths(scripts as StudioLuaScript[]);
}

function normalizeLegacyGroup(
  value: unknown,
  root: string,
  kind: "server" | "client" | "module",
): StudioLuaScript[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${kind} Lua entry ${index + 1} must be an object`);
    }

    if (isNonEmptyString(entry.path) && typeof entry.content === "string") {
      return { path: entry.path, content: entry.content };
    }

    if (!isNonEmptyString(entry.name) || typeof entry.code !== "string") {
      throw new Error(
        `${kind} Lua entry ${index + 1} requires name/code or path/content`,
      );
    }

    return {
      path: `${root}/${ensureLuaSuffix(entry.name, kind)}`,
      content: entry.code,
    };
  });
}

function ensureLuaSuffix(
  name: string,
  kind: "server" | "client" | "module",
): string {
  const withoutLua = name.replace(/\.lua$/i, "");
  if (kind === "server") {
    return withoutLua.endsWith(".server")
      ? `${withoutLua}.lua`
      : `${withoutLua}.server.lua`;
  }
  if (kind === "client") {
    return withoutLua.endsWith(".client")
      ? `${withoutLua}.lua`
      : `${withoutLua}.client.lua`;
  }
  return `${withoutLua}.lua`;
}

function assertUniquePaths(scripts: StudioLuaScript[]): void {
  const seen = new Set<string>();
  for (const script of scripts) {
    if (seen.has(script.path)) {
      throw new Error(`Duplicate Lua script path: ${script.path}`);
    }
    seen.add(script.path);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const GENERATION_ARTIFACT_STAGE_MAP = AGENT_STAGE_MAP;
