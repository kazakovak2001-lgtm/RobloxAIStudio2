/**
 * ASSET-FABRIC-1 — the typed contract for planned assets.
 *
 * `asset_planner` runs on every generation and its output was stored and
 * shipped to Studio without ever being checked: no schema, no decoder, no
 * lineage. `STUDIO-2F-A` gave UI a typed materializable tree and `WORLD-1A`
 * gave the world a typed model; assets had neither.
 *
 * This derives a typed plan from what the agent emits, the same way
 * `buildUIArtifactContent` derives a materializable tree. Nothing here uploads,
 * resolves or materializes an asset — the plan stays a plan, and
 * `ASSET-FABRIC-2` is where anything is fetched.
 */

/** Bumped when the shape changes. A payload on another version is refused. */
export const ASSET_PLAN_SCHEMA_VERSION = 1;

/**
 * What an asset *is*, stated on the entry.
 *
 * The agent groups assets into four arrays, so kind is positional today: an
 * entry is a texture because of the array it sits in, and a flattened list
 * would lose it entirely. Naming it on the entry means a consumer never has to
 * infer kind from a field name or from `name`.
 */
export const ASSET_KINDS = ["model", "texture", "sound", "animation"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const MODEL_COMPLEXITIES = ["simple", "medium", "complex"] as const;
export const MODEL_SOURCES = ["builtin", "marketplace", "custom"] as const;
export const SOUND_KINDS = ["sfx", "music", "ambient"] as const;

export interface PlannedAsset {
  /** Stable identity, unique across the whole plan. Never the display name. */
  readonly id: string;
  readonly kind: AssetKind;
  /** Human-readable label. Never used for identity. */
  readonly name: string;
  /**
   * What the asset is for.
   *
   * Optional because the current producer states it for models only — it has
   * no field for it on textures, sounds or animations. Representable rather
   * than invented: an absent purpose means the plan did not say.
   */
  readonly purpose?: string;
  /**
   * Whether the game is incomplete without this asset.
   *
   * Optional for the same reason: nothing the agent emits carries a
   * required-ness signal, so populating it would be fabrication. The contract
   * can express it as soon as a producer states it.
   */
  readonly required?: boolean;
  /**
   * Ids of other planned assets this one depends on.
   *
   * The agent names an animation's model in a `target` field holding a display
   * *name*. That is resolved to an id here, because a reference that depends
   * on a label is not a reference. A target naming no model, or naming more
   * than one, resolves to nothing and is reported rather than guessed.
   */
  readonly references: readonly string[];
  /** Kind-specific detail, decoded against closed sets where they exist. */
  readonly attributes: Readonly<Record<string, string | number>>;
}

export interface AssetPlan {
  readonly schemaVersion: number;
  /** Order-preserving: models, then textures, sounds, animations. */
  readonly assets: readonly PlannedAsset[];
}

/** One reason a payload is not a valid plan, with the entry that caused it. */
export interface AssetPlanIssue {
  /** Where the problem is, e.g. `assetPlan.models[2].id`. */
  readonly path: string;
  readonly message: string;
}

/**
 * Whether this generation produced a readable plan.
 *
 * `not-planned` and `invalid` are separate on purpose. A run whose asset stage
 * never produced output has no plan; a run that produced something unreadable
 * has a defect. Reporting either as a plan is the failure this line of work
 * keeps correcting.
 */
export const ASSET_PLAN_OUTCOMES = [
  "planned",
  "invalid",
  "not-planned",
] as const;
export type AssetPlanOutcome = (typeof ASSET_PLAN_OUTCOMES)[number];

export interface AssetPlanResult {
  readonly outcome: AssetPlanOutcome;
  /** Present only when `outcome` is `planned`. */
  readonly plan?: AssetPlan;
  /** Ordered by path, so the same input reports the same way on any host. */
  readonly issues: readonly AssetPlanIssue[];
}

type Row = Record<string, unknown>;

function asRecord(value: unknown): Row | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** The four arrays the producer emits, and the kind each one carries. */
const KIND_BY_FIELD: ReadonlyArray<readonly [string, AssetKind]> = [
  ["models", "model"],
  ["textures", "texture"],
  ["sounds", "sound"],
  ["animations", "animation"],
];

function decodeAttributes(
  kind: AssetKind,
  entry: Row,
  path: string,
  issues: AssetPlanIssue[],
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};
  const closed = (field: string, allowed: readonly string[]): void => {
    const value = readString(entry[field]);
    if (value === null) {
      issues.push({
        path: `${path}.${field}`,
        message: `${field} is required`,
      });
      return;
    }
    if (!allowed.includes(value)) {
      issues.push({
        path: `${path}.${field}`,
        message: `${field} must be one of ${allowed.join(", ")}, received ${JSON.stringify(value)}`,
      });
      return;
    }
    attributes[field] = value;
  };

  if (kind === "model") {
    closed("complexity", MODEL_COMPLEXITIES);
    // `marketplace` and `custom` are claims about where an asset would come
    // from. Nothing resolves either, and recording the claim is not the same
    // as acting on it — see ASSET-FABRIC-2.
    closed("source", MODEL_SOURCES);
  } else if (kind === "sound") {
    const value = readString(entry.type);
    if (value === null) {
      issues.push({ path: `${path}.type`, message: "type is required" });
    } else if (!SOUND_KINDS.includes(value as (typeof SOUND_KINDS)[number])) {
      issues.push({
        path: `${path}.type`,
        message: `type must be one of ${SOUND_KINDS.join(", ")}, received ${JSON.stringify(value)}`,
      });
    } else {
      attributes.soundKind = value;
    }
  } else if (kind === "texture") {
    const resolution = readString(entry.resolution);
    if (resolution === null) {
      issues.push({
        path: `${path}.resolution`,
        message: "resolution is required",
      });
    } else {
      attributes.resolution = resolution;
    }
  } else {
    const frames = entry.frames;
    if (
      typeof frames !== "number" ||
      !Number.isInteger(frames) ||
      frames <= 0
    ) {
      issues.push({
        path: `${path}.frames`,
        message: "frames must be a positive integer",
      });
    } else {
      attributes.frames = frames;
    }
  }

  return attributes;
}

/**
 * Derive a typed plan from the agent's output.
 *
 * Never throws: an unreadable plan is a reported outcome, not an exception, so
 * a generation is never lost to a malformed asset list. That mirrors the UI
 * path, where output too malformed to read is recorded as a failed
 * materialization rather than aborting the run.
 */
export function buildAssetPlan(output: unknown): AssetPlanResult {
  const issues: AssetPlanIssue[] = [];
  const root = asRecord(output);
  const raw = root ? asRecord(root.assetPlan) : null;

  if (!raw) {
    // Nothing to read is not a defect in the plan; it means no plan was made.
    return { outcome: "not-planned", issues: [] };
  }

  const assets: PlannedAsset[] = [];
  const seenIds = new Map<string, string>();
  // Display name to ids, so an animation's `target` can be resolved without
  // trusting the label as identity. A name shared by two models resolves to
  // nothing rather than to whichever came first.
  const modelIdsByName = new Map<string, string[]>();
  const pending: Array<{ entry: Row; asset: PlannedAsset; path: string }> = [];

  for (const [field, kind] of KIND_BY_FIELD) {
    const list = raw[field];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      issues.push({
        path: `assetPlan.${field}`,
        message: `${field} must be an array`,
      });
      continue;
    }

    for (const [index, item] of list.entries()) {
      const path = `assetPlan.${field}[${index}]`;
      const entry = asRecord(item);
      if (!entry) {
        issues.push({ path, message: "asset entry must be an object" });
        continue;
      }

      const id = readString(entry.id);
      const name = readString(entry.name);
      if (id === null)
        issues.push({ path: `${path}.id`, message: "id is required" });
      if (name === null) {
        issues.push({ path: `${path}.name`, message: "name is required" });
      }

      const attributes = decodeAttributes(kind, entry, path, issues);
      if (id === null || name === null) continue;

      const firstSeenAt = seenIds.get(id);
      if (firstSeenAt !== undefined) {
        // A duplicate id makes every reference to it ambiguous, so it is a
        // validation failure rather than a last-one-wins merge.
        issues.push({
          path: `${path}.id`,
          message: `duplicate asset id ${JSON.stringify(id)}, already used at ${firstSeenAt}`,
        });
        continue;
      }
      seenIds.set(id, `${path}.id`);

      if (kind === "model") {
        modelIdsByName.set(name, [...(modelIdsByName.get(name) ?? []), id]);
      }

      const purpose = readString(entry.description);
      const asset: PlannedAsset = {
        id,
        kind,
        name,
        ...(purpose ? { purpose } : {}),
        references: [],
        attributes,
      };
      assets.push(asset);
      pending.push({ entry, asset, path });
    }
  }

  // Resolved after every id is known, so a reference may name an asset that
  // appears later in the plan.
  const resolved = pending.map(({ entry, asset, path }) => {
    if (asset.kind !== "animation") return asset;
    const target = readString(entry.target);
    if (target === null) return asset;

    const matches = modelIdsByName.get(target) ?? [];
    if (matches.length !== 1) {
      issues.push({
        path: `${path}.target`,
        message:
          matches.length === 0
            ? `target ${JSON.stringify(target)} names no planned model`
            : `target ${JSON.stringify(target)} names ${matches.length} planned models, so it identifies none`,
      });
      return asset;
    }
    return { ...asset, references: [matches[0]] };
  });

  if (issues.length > 0) {
    return { outcome: "invalid", issues: orderIssues(issues) };
  }

  return {
    outcome: "planned",
    plan: { schemaVersion: ASSET_PLAN_SCHEMA_VERSION, assets: resolved },
    issues: [],
  };
}

/**
 * Ordered by path, then message, compared code unit by code unit.
 *
 * `localeCompare` orders two byte-identical strings differently on hosts with
 * different locales — the defect `SECURITY-REVIEW-A2` had to correct.
 */
function orderIssues(issues: AssetPlanIssue[]): AssetPlanIssue[] {
  const compare = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  return [...issues].sort(
    (left, right) =>
      compare(left.path, right.path) || compare(left.message, right.message),
  );
}

/**
 * Decode a plan read back out of durable storage.
 *
 * Strict about the version, following the policy `UIInstanceTreeContract` sets:
 * a payload on another version is refused outright rather than partially read,
 * because a field absent from version 1 cannot be interpreted by version 1.
 *
 * Returns `null` for a legacy untyped payload, which is the truthful answer —
 * those artifacts were written before this contract and are never rewritten or
 * assigned a version they never had.
 */
export function decodeAssetPlan(stored: unknown): AssetPlan | null {
  const record = asRecord(stored);
  if (!record) return null;
  if (record.schemaVersion !== ASSET_PLAN_SCHEMA_VERSION) return null;
  if (!Array.isArray(record.assets)) return null;

  const assets: PlannedAsset[] = [];
  const seen = new Set<string>();
  for (const item of record.assets) {
    const entry = asRecord(item);
    if (!entry) return null;
    const id = readString(entry.id);
    const name = readString(entry.name);
    const kind = readString(entry.kind);
    if (!id || !name || !kind) return null;
    if (!ASSET_KINDS.includes(kind as AssetKind)) return null;
    if (seen.has(id)) return null;
    seen.add(id);

    const references = entry.references;
    if (!Array.isArray(references)) return null;
    if (references.some((reference) => readString(reference) === null)) {
      return null;
    }
    const attributes = asRecord(entry.attributes);
    if (!attributes) return null;

    const purpose = readString(entry.purpose);
    assets.push({
      id,
      kind: kind as AssetKind,
      name,
      ...(purpose ? { purpose } : {}),
      ...(typeof entry.required === "boolean"
        ? { required: entry.required }
        : {}),
      references: references as string[],
      attributes: attributes as Record<string, string | number>,
    });
  }

  return { schemaVersion: ASSET_PLAN_SCHEMA_VERSION, assets };
}
