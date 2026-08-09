/**
 * worldModel.ts
 *
 * WORLD-1A. What a generation *claims* the world contains, as typed semantic
 * data — deliberately not geometry, and deliberately not a template.
 *
 * The temptation here is a fixed shape: a spawn, some collectibles, an
 * objective. That describes exactly one game, and a platform that can only
 * validate the game it already knows how to make is validating nothing. So a
 * claim carries a *role* — what it is for — rather than a form, and roles
 * compose through relationships, constraints and dependencies. A racing game,
 * a tycoon and an obby all express themselves in the same vocabulary.
 *
 * This model is non-canonical and is not materialized. The runtime world is
 * still built imperatively by the generated server `Script`, which the
 * playability contract requires; nothing here creates Roblox instances or
 * competes for ownership of them. Its only consumer is cross-artifact
 * validation, which asks whether the generated Lua honours these claims.
 *
 * Pure module: no I/O, no clock, no model calls.
 */

/** Contract version of the world model body. Bump on any shape change. */
export const WORLD_MODEL_SCHEMA_VERSION = 1;

/**
 * What a claimed system or entity is *for*.
 *
 * A closed set, because each role is what tells the validator which evidence
 * would confirm it. Adding a role means deciding what would prove it — which
 * is the point. A claim whose role has no verification strategy is reported as
 * unverifiable rather than passing quietly.
 */
export const WORLD_ROLES = [
  /** Players enter the world somewhere under the world's own control. */
  "player-entry",
  /** Something a player can act on, however that action is expressed. */
  "interactive-entity",
  /** State crossing the server/client boundary so the player learns of it. */
  "progress-signal",
  /** Something surfaced to the player as presentation rather than mechanism. */
  "presentation",
  /** State intended to outlive a session. */
  "persistence",
  /** A rule the server is claimed to own rather than trust the client for. */
  "server-authority",
  /** A claim that carries meaning for people but names no runtime evidence. */
  "descriptive",
] as const;
export type WorldRole = (typeof WORLD_ROLES)[number];

/** Where a claim came from. Claims are derived, never invented here. */
export const WORLD_CLAIM_SOURCES = [
  "game-design",
  "architecture",
  "blueprint",
] as const;
export type WorldClaimSource = (typeof WORLD_CLAIM_SOURCES)[number];

/** A named capability the generation says the world provides. */
export interface WorldSystem {
  /** Stable within one model; derived from the claim, never random. */
  readonly id: string;
  readonly role: WorldRole;
  /** The claim in the words of the stage that made it. */
  readonly title: string;
  readonly source: WorldClaimSource;
}

/** Something the world is said to contain that a player can encounter. */
export interface WorldEntity {
  readonly id: string;
  readonly role: WorldRole;
  readonly title: string;
  readonly source: WorldClaimSource;
  /** Claimed count, when the source states one. Absent means unstated. */
  readonly quantity?: number;
}

/** How claims relate. Direction matters: `from` acts on `to`. */
export const WORLD_RELATION_KINDS = [
  "notifies",
  "produces",
  "consumes",
  "owns",
  "requires",
] as const;
export type WorldRelationKind = (typeof WORLD_RELATION_KINDS)[number];

export interface WorldRelationship {
  readonly from: string;
  readonly to: string;
  readonly kind: WorldRelationKind;
}

/** A rule the world claims to hold, stated as prose with a typed kind. */
export const WORLD_CONSTRAINT_KINDS = [
  "server-authoritative",
  "client-observable",
  "persistent",
  "unclassified",
] as const;
export type WorldConstraintKind = (typeof WORLD_CONSTRAINT_KINDS)[number];

export interface WorldConstraint {
  readonly id: string;
  readonly kind: WorldConstraintKind;
  readonly statement: string;
  readonly source: WorldClaimSource;
}

/** A system that cannot hold without others. */
export interface WorldDependency {
  readonly systemId: string;
  readonly requires: readonly string[];
}

export interface WorldModel {
  readonly schemaVersion: number;
  readonly systems: readonly WorldSystem[];
  readonly entities: readonly WorldEntity[];
  readonly relationships: readonly WorldRelationship[];
  readonly constraints: readonly WorldConstraint[];
  readonly dependencies: readonly WorldDependency[];
  /**
   * Stated on the record so a reader is never left inferring how much this
   * model knows.
   */
  readonly limits: readonly string[];
}

const MODEL_LIMITS: readonly string[] = [
  "Claims are derived from what the design and architecture stages stated; nothing here observes a running game.",
  "This model is not geometry: it says what the world is for, never where anything is.",
  "It is non-canonical. The runtime world is built by the generated server script, and nothing here materializes instances.",
  "A claim with no verifiable role is carried so it is not lost, not because it can be checked.",
];

/** Outputs this model can be derived from, as the recorder observed them. */
export interface WorldModelSources {
  readonly gameDesign?: unknown;
  readonly architecture?: unknown;
}

/**
 * Derive the world model from claims the pipeline already made.
 *
 * No new agent, and no invention: every system, entity and constraint here is
 * traceable to a field some earlier stage emitted. When a stage said nothing,
 * the model is correspondingly empty rather than padded with defaults — an
 * empty model is a true statement about a generation that claimed nothing.
 */
export function buildWorldModel(sources: WorldModelSources): WorldModel {
  const systems: WorldSystem[] = [];
  const entities: WorldEntity[] = [];
  const relationships: WorldRelationship[] = [];
  const constraints: WorldConstraint[] = [];
  const dependencies: WorldDependency[] = [];

  const design = asRecord(sources.gameDesign);
  const gameplay = asRecord(design?.gameplay);
  const balance = asRecord(gameplay?.balance);
  const progression = asRecord(gameplay?.progression);

  // Mechanics are the interaction surface: whatever the player does, the
  // design named it here.
  for (const [index, mechanic] of readList(gameplay?.mechanics).entries()) {
    const title = readTitle(mechanic);
    if (!title) continue;
    entities.push({
      id: `mechanic-${index + 1}`,
      role: "interactive-entity",
      title,
      source: "game-design",
      ...(readQuantity(mechanic) !== undefined
        ? { quantity: readQuantity(mechanic) }
        : {}),
    });
  }

  // A win or lose condition is a claim about state the player must be able to
  // observe changing, whatever the game is.
  for (const key of ["winCondition", "loseCondition"] as const) {
    const statement = readString(balance?.[key] ?? design?.[key]);
    if (!statement) continue;
    const id = `condition-${key}`;
    systems.push({
      id,
      role: "progress-signal",
      title: statement,
      source: "game-design",
    });
    constraints.push({
      id: `${id}-observable`,
      kind: "client-observable",
      statement,
      source: "game-design",
    });
  }

  const scoring = readString(
    balance?.economyOrScoring ?? design?.economyOrScoring,
  );
  if (scoring) {
    systems.push({
      id: "scoring",
      role: "progress-signal",
      title: scoring,
      source: "game-design",
    });
  }

  const progressionModel = readString(
    progression?.player_progression_model ?? design?.progressionModel,
  );
  if (progressionModel) {
    systems.push({
      id: "progression",
      role: "descriptive",
      title: progressionModel,
      source: "game-design",
    });
  }

  // Architecture states which services the server is claimed to own. Their
  // names carry the role: a spawn service is a player-entry claim whatever
  // the game is, a data service is a persistence claim.
  const architecture = asRecord(asRecord(sources.architecture)?.architecture);
  for (const [name, description] of Object.entries(
    asRecord(architecture?.services) ?? {},
  )) {
    const id = `service-${slug(name)}`;
    systems.push({
      id,
      role: roleForServiceName(name),
      title: `${name}: ${readString(description) ?? "no description"}`,
      source: "architecture",
    });
    constraints.push({
      id: `${id}-server-owned`,
      kind: "server-authoritative",
      statement: `${name} is owned by the server`,
      source: "architecture",
    });
  }

  // API contracts are relationships: something announces, something receives.
  for (const name of Object.keys(asRecord(architecture?.apiContracts) ?? {})) {
    const id = `contract-${slug(name)}`;
    systems.push({
      id,
      role: "progress-signal",
      title: name,
      source: "architecture",
    });
    relationships.push({ from: id, to: "presentation", kind: "notifies" });
  }

  // The HUD is the one presentation claim the platform makes for every game,
  // because the playability contract requires a client to build one.
  systems.push({
    id: "presentation",
    role: "presentation",
    title: "The client presents world state to the player",
    source: "blueprint",
  });

  for (const signal of systems.filter(
    (system) => system.role === "progress-signal",
  )) {
    dependencies.push({ systemId: signal.id, requires: ["presentation"] });
  }

  return {
    schemaVersion: WORLD_MODEL_SCHEMA_VERSION,
    systems,
    entities,
    relationships,
    constraints,
    dependencies,
    limits: MODEL_LIMITS,
  };
}

/**
 * Map a claimed service name to the role its name asserts.
 *
 * Matching on the name is a heuristic, and it is confined to this one function
 * on purpose: a wrong guess produces a role whose evidence is then genuinely
 * checked, so a mismatch surfaces as a failed or unverifiable check rather
 * than as a silent pass.
 */
function roleForServiceName(name: string): WorldRole {
  const lowered = name.toLowerCase();
  if (/(spawn|respawn|lobby|teleport)/.test(lowered)) return "player-entry";
  if (/(data|save|store|persist)/.test(lowered)) return "persistence";
  if (/(event|remote|network|replicat)/.test(lowered)) return "progress-signal";
  if (/(ui|hud|interface|menu)/.test(lowered)) return "presentation";
  return "server-authority";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readTitle(value: unknown): string | undefined {
  if (typeof value === "string") return readString(value);
  const record = asRecord(value);
  return readString(record?.name) ?? readString(record?.title);
}

function readQuantity(value: unknown): number | undefined {
  const parameters = asRecord(asRecord(value)?.parameters);
  const count = parameters?.count ?? parameters?.quantity ?? parameters?.amount;
  return typeof count === "number" && Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : undefined;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
