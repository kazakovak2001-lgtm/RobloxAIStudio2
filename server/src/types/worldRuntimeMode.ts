export const WORLD_RUNTIME_MODES = ["lua-owned", "materialized-world"] as const;

export type WorldRuntimeMode = (typeof WORLD_RUNTIME_MODES)[number];

/** Executions recorded before WORLD-1C built their world from server Lua. */
export const LEGACY_WORLD_RUNTIME_MODE: WorldRuntimeMode = "lua-owned";

export interface ResolvedWorldRuntimeMode {
  readonly mode: WorldRuntimeMode;
  /** False only when reading a record written before WORLD-1C. */
  readonly explicit: boolean;
}

export function isWorldRuntimeMode(value: unknown): value is WorldRuntimeMode {
  return WORLD_RUNTIME_MODES.includes(value as WorldRuntimeMode);
}

/**
 * Resolve a durable value without reinterpreting malformed new data as legacy.
 * Only absence means the historical lua-owned mode; an unknown value fails.
 */
export function resolveWorldRuntimeMode(
  value: unknown,
): ResolvedWorldRuntimeMode {
  if (value === undefined) {
    return { mode: LEGACY_WORLD_RUNTIME_MODE, explicit: false };
  }
  if (!isWorldRuntimeMode(value)) {
    throw new Error(`Unknown world runtime mode: ${String(value)}`);
  }
  return { mode: value, explicit: true };
}

export function resolveWorldRuntimeModeFromContent(
  content: unknown,
): ResolvedWorldRuntimeMode {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return resolveWorldRuntimeMode(undefined);
  }
  const record = content as Record<string, unknown>;
  return resolveWorldRuntimeMode(
    Object.prototype.hasOwnProperty.call(record, "worldRuntimeMode")
      ? record.worldRuntimeMode
      : undefined,
  );
}
