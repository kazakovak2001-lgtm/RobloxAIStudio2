/**
 * Project design inputs — the Game Concept and Map & Environment sections.
 *
 * Both sections are stored on the project record itself (no second source of
 * truth). Genre, target audience and the core idea reuse the existing
 * `genre`, `targetAudience` and `description` project fields; this module only
 * holds the additional structured inputs.
 *
 * Absence of a section means "not stated" (legacy projects). A field that is
 * present with a wrong type is an error, never silently defaulted.
 */

export interface GameConceptConfig {
  /** Longer-form vision statement; the core idea itself is `project.description`. */
  vision?: string;
  gameplayLoop?: string;
  coreMechanics?: string[];
  playerExperience?: string;
  designConstraints?: string[];
}

export interface MapEnvironmentConfig {
  worldTheme?: string;
  environmentType?: string;
  mapStructure?: string;
  mainLocations?: string[];
  atmosphere?: string;
  constraints?: string[];
}

export class DesignInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignInputError";
  }
}

type FieldSpec =
  | { kind: "text"; max: number }
  | { kind: "list"; maxItems: number; maxItemLength: number };

const GAME_CONCEPT_FIELDS: Record<keyof GameConceptConfig, FieldSpec> = {
  vision: { kind: "text", max: 2000 },
  gameplayLoop: { kind: "text", max: 1500 },
  coreMechanics: { kind: "list", maxItems: 20, maxItemLength: 120 },
  playerExperience: { kind: "text", max: 1000 },
  designConstraints: { kind: "list", maxItems: 20, maxItemLength: 200 },
};

const MAP_ENVIRONMENT_FIELDS: Record<keyof MapEnvironmentConfig, FieldSpec> = {
  worldTheme: { kind: "text", max: 200 },
  environmentType: { kind: "text", max: 100 },
  mapStructure: { kind: "text", max: 1000 },
  mainLocations: { kind: "list", maxItems: 20, maxItemLength: 120 },
  atmosphere: { kind: "text", max: 1000 },
  constraints: { kind: "list", maxItems: 20, maxItemLength: 200 },
};

/** True when a stored section carries at least one stated field. */
export function hasContent(section: object | undefined): boolean {
  return section !== undefined && Object.keys(section).length > 0;
}

const has = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

/**
 * Parse a partial section. Returns only the fields present in the input;
 * a blank string / empty list means "clear this field" and is kept as such so
 * a merge can drop it. Unknown keys are rejected.
 */
function parseSection(
  section: string,
  value: unknown,
  specs: Record<string, FieldSpec>,
): Record<string, string | string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DesignInputError(`${section} must be an object`);
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!has(specs, key)) {
      throw new DesignInputError(`${section}.${key} is not a supported field`);
    }
  }
  const out: Record<string, string | string[]> = {};
  for (const [field, spec] of Object.entries(specs)) {
    if (!has(input, field)) continue;
    const raw = input[field];
    const path = `${section}.${field}`;
    if (spec.kind === "text") {
      if (typeof raw !== "string") {
        throw new DesignInputError(`${path} must be a string`);
      }
      const text = raw.trim();
      if (text.length > spec.max) {
        throw new DesignInputError(
          `${path} must not exceed ${spec.max} characters`,
        );
      }
      out[field] = text;
    } else {
      if (!Array.isArray(raw)) {
        throw new DesignInputError(`${path} must be an array of strings`);
      }
      const items: string[] = [];
      for (const item of raw) {
        if (typeof item !== "string") {
          throw new DesignInputError(`${path} must be an array of strings`);
        }
        const text = item.trim();
        if (!text) continue;
        if (text.length > spec.maxItemLength) {
          throw new DesignInputError(
            `${path} items must not exceed ${spec.maxItemLength} characters`,
          );
        }
        items.push(text);
      }
      if (items.length > spec.maxItems) {
        throw new DesignInputError(
          `${path} must not contain more than ${spec.maxItems} items`,
        );
      }
      out[field] = items;
    }
  }
  return out;
}

export function parseGameConceptPatch(
  value: unknown,
): Partial<GameConceptConfig> {
  return parseSection(
    "gameConcept",
    value,
    GAME_CONCEPT_FIELDS,
  ) as Partial<GameConceptConfig>;
}

export function parseMapEnvironmentPatch(
  value: unknown,
): Partial<MapEnvironmentConfig> {
  return parseSection(
    "mapEnvironment",
    value,
    MAP_ENVIRONMENT_FIELDS,
  ) as Partial<MapEnvironmentConfig>;
}

/**
 * Merge a parsed patch into the stored section in canonical key order.
 * Blank text / empty lists remove the field. Returns undefined when nothing
 * remains, so an emptied section reads as "not stated".
 */
function mergeSection<T extends object>(
  existing: T | undefined,
  patch: Partial<T>,
  order: readonly string[],
): T | undefined {
  const merged: Record<string, unknown> = {
    ...((existing as Record<string, unknown> | undefined) ?? {}),
    ...(patch as Record<string, unknown>),
  };
  const out: Record<string, unknown> = {};
  for (const key of order) {
    if (!has(merged, key)) continue;
    const v = merged[key];
    if (typeof v === "string" ? v === "" : Array.isArray(v) && v.length === 0) {
      continue;
    }
    out[key] = v;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

export function mergeGameConcept(
  existing: GameConceptConfig | undefined,
  patch: Partial<GameConceptConfig>,
): GameConceptConfig | undefined {
  return mergeSection(existing, patch, Object.keys(GAME_CONCEPT_FIELDS));
}

export function mergeMapEnvironment(
  existing: MapEnvironmentConfig | undefined,
  patch: Partial<MapEnvironmentConfig>,
): MapEnvironmentConfig | undefined {
  return mergeSection(existing, patch, Object.keys(MAP_ENVIRONMENT_FIELDS));
}

/** Prompt-ready text for the stated design inputs; empty when none stated. */
export function describeDesignInputs(
  bp: Record<string, unknown> | undefined,
): string {
  const lines: string[] = [];
  const gc = bp && has(bp, "game_concept") ? bp.game_concept : undefined;
  const me = bp && has(bp, "map_environment") ? bp.map_environment : undefined;
  const add = (label: string, v: unknown): void => {
    if (typeof v === "string" && v) lines.push(`${label}: ${v}`);
    else if (Array.isArray(v) && v.length > 0) {
      lines.push(
        `${label}: ${v.filter((i) => typeof i === "string").join("; ")}`,
      );
    }
  };
  if (gc && typeof gc === "object") {
    const c = gc as Record<string, unknown>;
    add("Vision", c.vision);
    add("Main gameplay loop", c.gameplayLoop);
    add("Core mechanics", c.coreMechanics);
    add("Intended player experience", c.playerExperience);
    add("Design constraints", c.designConstraints);
  }
  if (me && typeof me === "object") {
    const m = me as Record<string, unknown>;
    add("World theme", m.worldTheme);
    add("Environment type", m.environmentType);
    add("Map structure", m.mapStructure);
    add("Main locations", m.mainLocations);
    add("Atmosphere and visual direction", m.atmosphere);
    add("Map and environment constraints", m.constraints);
  }
  return lines.length
    ? `\n\nUser-stated design inputs (treat as requirements):\n${lines.join("\n")}`
    : "";
}
