/**
 * RepairInputAssembler — Builds a real PlaytestInput from stored pipeline
 * artifacts for a given execution. Ports the same script/asset parsing
 * Frontend's projectQualityArtifacts.ts already uses for the same purpose,
 * so repair analyzes the exact artifacts a human-run playtest would see.
 */

import type { ArtifactStore, PipelineArtifact } from "../pipeline/v2";
import type { PlaytestInput } from "../playtest";
import { decodeAssetPlan } from "../validation/assetPlan";
import {
  normalizeLuaScripts,
  type PlayableLuaScript,
} from "../types/playableLua";

export interface RepairAssembledInput {
  input: PlaytestInput;
  luaArtifact: PipelineArtifact;
  scripts: PlayableLuaScript[];
}

/**
 * Loads the LUA_GENERATION and ASSET_PLANNING artifacts for an execution
 * and builds a PlaytestInput from their real content. Throws if the
 * execution has no Lua artifact — there is nothing to repair without one.
 */
export async function assembleRepairInput(
  artifactStore: ArtifactStore,
  projectId: string,
  executionId: string,
): Promise<RepairAssembledInput> {
  const artifacts = artifactStore.getByPipeline(executionId);
  const luaArtifact = artifacts.find((a) => a.stage === "LUA_GENERATION");
  if (!luaArtifact) {
    throw new Error(
      `No LUA_GENERATION artifact found for execution ${executionId}`,
    );
  }

  const scripts = normalizeLuaScripts(luaArtifact.content);
  const playtestScripts = scripts.map((script) => ({
    name: scriptName(script.path),
    type: scriptType(script.path),
    path: script.path,
    content: script.content,
    dependencies: [] as string[],
  }));

  const assetArtifact = artifacts.find((a) => a.stage === "ASSET_PLANNING");
  const assets = assetArtifact ? parseAssetPlan(assetArtifact.content) : [];

  const input: PlaytestInput = {
    projectId,
    scripts: playtestScripts,
    assets,
    dependencyGraph: {
      nodes: playtestScripts.map((script) => script.path),
      edges: [],
      circular: [],
    },
  };

  return { input, luaArtifact, scripts };
}

/** Where each asset kind is expected to live in a Roblox place. */
const ASSET_SERVICE: Readonly<Record<string, string>> = {
  model: "Workspace",
  texture: "ReplicatedStorage",
  sound: "SoundService",
  animation: "ReplicatedStorage",
};

function parseAssetPlan(value: unknown): PlaytestInput["assets"] {
  const content = asRecord(value, "asset planning artifact");

  // ASSET-FABRIC-1 stores a typed plan. Read it first, and keep the legacy
  // wrapper working: executions recorded before that contract still hold it,
  // and reporting zero assets for them would change repair scoring on runs
  // nothing is wrong with.
  const typed = decodeAssetPlan(content);
  if (typed) {
    return typed.assets.map((asset) => ({
      name: asset.name,
      type: asset.kind,
      targetService: ASSET_SERVICE[asset.kind] ?? "ReplicatedStorage",
      // Still a plan, not evidence that a binary asset exists — unchanged by
      // the plan gaining a type.
      placeholder: true,
    }));
  }

  const planValue = content.assetPlan;
  if (planValue === undefined) return [];
  const plan = asRecord(planValue, "asset plan");
  const groups = [
    ["models", "model", "Workspace"],
    ["textures", "texture", "ReplicatedStorage"],
    ["sounds", "sound", "SoundService"],
    ["animations", "animation", "ReplicatedStorage"],
  ] as const;

  return groups.flatMap(([key, type, targetService]) => {
    const entries = plan[key];
    if (entries === undefined) return [];
    if (!Array.isArray(entries)) {
      throw new Error(`Invalid asset plan ${key}`);
    }
    return entries.map((value, index) => {
      const asset = asRecord(value, `${key} asset ${index + 1}`);
      return {
        name: asString(
          asset.name ?? asset.id,
          `${key} asset ${index + 1} name`,
        ),
        type,
        targetService,
        // The artifact is a plan, not evidence that a binary asset was generated.
        placeholder: true,
      };
    });
  });
}

function scriptType(
  path: string,
): "ServerScript" | "LocalScript" | "ModuleScript" {
  if (path.startsWith("ServerScriptService/")) return "ServerScript";
  if (
    path.startsWith("StarterPlayerScripts/") ||
    path.startsWith("StarterGui/")
  ) {
    return "LocalScript";
  }
  return "ModuleScript";
}

function scriptName(path: string): string {
  const filename = path.split("/").at(-1) ?? path;
  return filename
    .replace(/\.(?:server|client)\.lua$/i, "")
    .replace(/\.lua$/i, "");
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}
