/**
 * ARTIFACT-CONTRACT-2 — the durable artifact envelope.
 *
 * The envelope answers, from the artifact alone: what exact thing is this, who
 * produced it, for which project, and from which upstream artifact state. None
 * of that may be reconstructed later from the current runtime configuration,
 * because the configuration is what changes.
 *
 * Pure by design. It computes and checks identity; it never reads storage, and
 * `resolve` is passed in so the store stays the only thing that holds artifacts.
 */

import { createHash } from "crypto";

import { getAgentDefinition } from "../../agents/contract/agentContract";
import type { StageName } from "./PipelineStage";

/**
 * Envelope version, not payload version.
 *
 * It describes the identity fields around the content — including which hash
 * algorithm produced `contentHash` — and is bumped when those change shape.
 * A stage payload gaining a field does not touch this.
 */
export const ARTIFACT_ENVELOPE_SCHEMA_VERSION = 1;

/**
 * The hash construction pinned by envelope version 1.
 *
 * Named rather than implied so a future envelope version can change it without
 * silently reinterpreting hashes already written.
 */
export const CONTENT_HASH_ALGORITHM = "sha256-canonical-json-v1";

/** Prefix carried by every hash this module produces. */
const CONTENT_HASH_PREFIX = "sha256:";

/** How the content came to exist. */
export type ArtifactProducerType = "agent" | "deterministic" | "human";

export interface ArtifactProducer {
  /**
   * `agent` when a model authored it, `deterministic` when code derived it,
   * `human` when a reviewer replaced the content by hand.
   */
  readonly type: ArtifactProducerType;
  /**
   * Agent id from AGENT-CONTRACT-1, a deterministic producer id below, or the
   * identifier of the reviewer who edited the content.
   */
  readonly id: string;
  /**
   * The producer contract version that ran — the agent definition version, or
   * the version of the code path that recorded the content. Never resolved
   * later from whatever the current registry happens to say.
   */
  readonly version: number;
}

/** The edit path's own contract version, used as the `human` producer version. */
export const HUMAN_EDIT_PRODUCER_VERSION = 1;

/**
 * Producer identity for content a reviewer replaced by hand.
 *
 * An edited artifact is not what its original producer made, so keeping the
 * original producer would attribute a person's bytes to an agent.
 */
export function humanEditProducer(editedBy: string): ArtifactProducer {
  if (!editedBy) {
    throw new ArtifactContentError(
      "An edited artifact must record who edited it",
    );
  }
  return {
    type: "human",
    id: editedBy,
    version: HUMAN_EDIT_PRODUCER_VERSION,
  };
}

export interface ArtifactDependency {
  /** Immutable id of the upstream artifact. */
  readonly artifactId: string;
  /** Its stage, so lineage is readable without resolving the artifact. */
  readonly stage: StageName;
  /** Its content hash, so a changed upstream is detectable rather than assumed. */
  readonly contentHash: string;
}

/**
 * Producers that are code rather than a model.
 *
 * Registered explicitly so `agent: null` and names like `repair-engine` stop
 * being untyped strings that nothing states the meaning of. The version is the
 * producer's own contract version, bumped when what it emits changes shape.
 */
export const DETERMINISTIC_PRODUCERS: Readonly<Record<string, number>> = {
  /** `buildGenerationValidationReport` — the VALIDATION report. */
  "generation-validation": 1,
  /** `reviewLuaSecurity` — the SECURITY_REVIEW report. */
  "lua-security-review": 1,
  /** `buildWorldModel` + `buildWorldScene` — the WORLD_MODEL artifact. */
  "world-model": 1,
  /** `RepairEngine` carrying an unchanged stage forward to a repaired run. */
  "repair-carry-forward": 1,
  /** `StudioIntegrationManager` adapting a legacy package into artifacts. */
  "legacy-package-adapter": 1,
  /**
   * A stage the v2 `PipelineExecutor` passes through without an agent and
   * without deriving anything — `REQUEST` and `EXPORT`.
   */
  "pipeline-stage-passthrough": 1,
};

/**
 * Which deterministic producer owns each agentless stage.
 *
 * Without this, every `agent: null` stage would be attributed to one producer,
 * which is false for four of the five stages that have no agent.
 */
export const AGENTLESS_STAGE_PRODUCERS: Readonly<
  Partial<Record<StageName, string>>
> = {
  REQUEST: "pipeline-stage-passthrough",
  WORLD_MODEL: "world-model",
  SECURITY_REVIEW: "lua-security-review",
  VALIDATION: "generation-validation",
  EXPORT: "pipeline-stage-passthrough",
};

export type DeterministicProducerId = keyof typeof DETERMINISTIC_PRODUCERS;

/**
 * Which upstream stages a stage may depend on.
 *
 * Deliberately not a general DAG engine, and deliberately not "anything
 * earlier in the pipeline". An edge means: if this upstream content changes,
 * the artifact may no longer describe the same generation state. Ordering
 * alone is not that relationship.
 *
 * A stage absent from this map may declare no dependencies at all.
 */
export const ARTIFACT_DEPENDENCY_RULES: Readonly<
  Partial<Record<StageName, readonly StageName[]>>
> = {
  ARCHITECTURE: ["GAME_DESIGN"],
  LUA_GENERATION: ["ARCHITECTURE", "GAME_DESIGN", "LUA_GENERATION"],
  UI_GENERATION: ["GAME_DESIGN"],
  WORLD_MODEL: ["GAME_DESIGN", "ARCHITECTURE"],
  SECURITY_REVIEW: ["LUA_GENERATION"],
  VALIDATION: ["LUA_GENERATION", "UI_GENERATION", "WORLD_MODEL"],
};

/**
 * Canonical JSON for hashing.
 *
 * Object keys are sorted because the data model treats objects as unordered:
 * two artifacts whose payloads differ only by insertion order are the same
 * artifact, and a JSONB round trip does not preserve insertion order anyway.
 * Arrays keep their order because order is meaning there — a different script
 * order is a different package.
 *
 * Unsupported values are rejected rather than dropped. `JSON.stringify` erases
 * `undefined`, functions and symbols from objects silently, which would let two
 * different payloads hash identically.
 */
export function canonicalJson(value: unknown, path = "$"): string {
  if (value === null) return "null";

  const valueType = typeof value;

  if (valueType === "string") return JSON.stringify(value);
  if (valueType === "boolean") return value ? "true" : "false";
  if (valueType === "number") {
    if (!Number.isFinite(value as number)) {
      throw new ArtifactContentError(
        `Artifact content holds a non-finite number at ${path}`,
      );
    }
    // -0 and 0 are the same value in this data model; JSON has no signed zero.
    return JSON.stringify((value as number) === 0 ? 0 : value);
  }
  if (
    valueType === "undefined" ||
    valueType === "function" ||
    valueType === "symbol" ||
    valueType === "bigint"
  ) {
    throw new ArtifactContentError(
      `Artifact content holds an unserializable ${valueType} at ${path}`,
    );
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((entry, index) => canonicalJson(entry, `${path}[${index}]`))
      .join(",")}]`;
  }

  if (value instanceof Date) {
    // Stable and lossless enough for identity; the alternative is rejecting
    // dates, which several stage payloads legitimately carry.
    return JSON.stringify(value.toISOString());
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(
    (key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key], `${path}.${key}`)}`,
  );
  return `{${entries.join(",")}}`;
}

/** Raised when content cannot be given a deterministic identity. */
export class ArtifactContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactContentError";
  }
}

/**
 * The content hash for an artifact payload.
 *
 * Depends on the content and nothing else — not the artifact id, not the
 * creation time, not review or validation metadata. Approving an artifact must
 * not change what it is.
 */
export function computeContentHash(content: unknown): string {
  const canonical = canonicalJson(content);
  return `${CONTENT_HASH_PREFIX}${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/** Producer identity for an artifact a model authored. */
export function agentProducer(agentId: string): ArtifactProducer {
  const definition = getAgentDefinition(agentId);
  if (!definition) {
    throw new ArtifactContentError(
      `No agent definition for producer "${agentId}", so its version is unknown`,
    );
  }
  return { type: "agent", id: agentId, version: definition.version };
}

/** Producer identity for an artifact code derived. */
export function deterministicProducer(id: string): ArtifactProducer {
  const version = DETERMINISTIC_PRODUCERS[id];
  if (version === undefined) {
    throw new ArtifactContentError(
      `Unknown deterministic producer "${id}"; register it before emitting artifacts`,
    );
  }
  return { type: "deterministic", id, version };
}

/**
 * Resolve producer identity for an artifact being written.
 *
 * An explicit producer always wins. Otherwise the `agent` argument the caller
 * already passes is used, and only when it names a defined agent — that is a
 * lookup, not a guess. Anything else must say who produced it, because
 * `agent: null` is shared by every deterministic stage and would otherwise
 * collapse three different producers into one.
 */
export function resolveProducer(
  agent: string | null,
  explicit?: ArtifactProducer | string,
): ArtifactProducer {
  // A bare string names a registered deterministic producer, so a caller in a
  // layer that must not import this module can still identify itself.
  if (typeof explicit === "string") return deterministicProducer(explicit);
  if (explicit) return explicit;
  if (agent !== null && getAgentDefinition(agent)) return agentProducer(agent);
  throw new ArtifactContentError(
    `Artifact produced by "${agent ?? "no agent"}" must name its producer explicitly`,
  );
}

export type ArtifactEnvelopeIssueCode =
  | "unsupported-schema-version"
  | "missing-project"
  | "content-hash-mismatch"
  | "malformed-producer"
  | "unknown-agent-producer"
  | "agent-version-mismatch"
  | "unknown-deterministic-producer"
  | "duplicate-dependency"
  | "self-dependency"
  | "unknown-dependency"
  | "dependency-project-mismatch"
  | "dependency-hash-mismatch"
  | "dependency-stage-mismatch"
  | "dependency-without-identity"
  | "dependency-not-committed"
  | "impossible-stage-lineage";

export interface ArtifactEnvelopeIssue {
  readonly code: ArtifactEnvelopeIssueCode;
  readonly artifactId: string;
  readonly message: string;
}

/** The envelope fields, without the storage and review metadata around them. */
export interface ArtifactEnvelope {
  readonly id: string;
  readonly stage: StageName;
  readonly content: unknown;
  readonly schemaVersion?: number;
  readonly projectId?: string;
  readonly contentHash?: string;
  readonly producer?: ArtifactProducer;
  readonly dependencies?: readonly ArtifactDependency[];
}

/** What a resolver must be able to say about an upstream artifact. */
export interface ResolvedDependency {
  readonly id: string;
  readonly stage: StageName;
  readonly projectId?: string;
  readonly contentHash?: string;
  readonly reviewStatus?: string;
}

/**
 * An artifact written before this slice, which carries no envelope.
 *
 * Absence is absence. Such an artifact is readable and deliverable, and must
 * never be presented as though it carried identity it never had.
 */
export function isLegacyArtifact(artifact: ArtifactEnvelope): boolean {
  return artifact.schemaVersion === undefined;
}

/**
 * Check one artifact's envelope.
 *
 * A legacy artifact returns no issues: it makes no claims, so there is nothing
 * to contradict. An artifact that claims an envelope is held to all of it.
 */
export function validateArtifactEnvelope(
  artifact: ArtifactEnvelope,
  resolve?: (artifactId: string) => ResolvedDependency | null,
): ArtifactEnvelopeIssue[] {
  const issues: ArtifactEnvelopeIssue[] = [];
  const fail = (code: ArtifactEnvelopeIssueCode, message: string): void => {
    issues.push({ code, artifactId: artifact.id, message });
  };

  if (isLegacyArtifact(artifact)) return issues;

  if (
    !Number.isInteger(artifact.schemaVersion) ||
    (artifact.schemaVersion as number) < 1 ||
    (artifact.schemaVersion as number) > ARTIFACT_ENVELOPE_SCHEMA_VERSION
  ) {
    // Fails closed on a malformed or future version rather than reading the
    // rest of the envelope under rules that may not apply to it.
    fail(
      "unsupported-schema-version",
      `Artifact "${artifact.id}" claims envelope schema version ${String(artifact.schemaVersion)}, which this build cannot interpret`,
    );
    return issues;
  }

  if (!artifact.projectId) {
    fail(
      "missing-project",
      `Artifact "${artifact.id}" carries an envelope but no owning project`,
    );
  }

  if (artifact.contentHash !== computeContentHash(artifact.content)) {
    fail(
      "content-hash-mismatch",
      `Artifact "${artifact.id}" does not hash to its recorded content hash`,
    );
  }

  issues.push(...producerIssues(artifact));
  issues.push(...dependencyIssues(artifact, resolve));

  return issues;
}

function producerIssues(artifact: ArtifactEnvelope): ArtifactEnvelopeIssue[] {
  const issues: ArtifactEnvelopeIssue[] = [];
  const producer = artifact.producer;
  const fail = (code: ArtifactEnvelopeIssueCode, message: string): void => {
    issues.push({ code, artifactId: artifact.id, message });
  };

  if (
    !producer ||
    typeof producer.id !== "string" ||
    producer.id.length === 0 ||
    !Number.isInteger(producer.version) ||
    producer.version < 1 ||
    (producer.type !== "agent" &&
      producer.type !== "deterministic" &&
      producer.type !== "human")
  ) {
    fail(
      "malformed-producer",
      `Artifact "${artifact.id}" carries an envelope without a well-formed producer identity`,
    );
    return issues;
  }

  if (producer.type === "agent") {
    const definition = getAgentDefinition(producer.id);
    if (!definition) {
      fail(
        "unknown-agent-producer",
        `Artifact "${artifact.id}" names agent producer "${producer.id}", which has no definition`,
      );
    } else if (definition.version !== producer.version) {
      // Only reported for agents that still exist. A historical version is not
      // wrong; a current artifact claiming a version the current definition
      // does not have is.
      fail(
        "agent-version-mismatch",
        `Artifact "${artifact.id}" claims agent "${producer.id}" version ${producer.version}, but the current definition is version ${definition.version}`,
      );
    }
    return issues;
  }

  // A human editor is identified by who they are, not by a registry entry.
  if (producer.type === "human") return issues;

  const registered = DETERMINISTIC_PRODUCERS[producer.id];
  if (registered === undefined) {
    fail(
      "unknown-deterministic-producer",
      `Artifact "${artifact.id}" names deterministic producer "${producer.id}", which is not registered`,
    );
  }
  return issues;
}

function dependencyIssues(
  artifact: ArtifactEnvelope,
  resolve?: (artifactId: string) => ResolvedDependency | null,
): ArtifactEnvelopeIssue[] {
  const issues: ArtifactEnvelopeIssue[] = [];
  const fail = (code: ArtifactEnvelopeIssueCode, message: string): void => {
    issues.push({ code, artifactId: artifact.id, message });
  };

  const dependencies = artifact.dependencies ?? [];
  const allowed = ARTIFACT_DEPENDENCY_RULES[artifact.stage] ?? [];
  const seen = new Set<string>();

  for (const dependency of dependencies) {
    if (seen.has(dependency.artifactId)) {
      fail(
        "duplicate-dependency",
        `Artifact "${artifact.id}" declares "${dependency.artifactId}" as a dependency more than once`,
      );
      continue;
    }
    seen.add(dependency.artifactId);

    if (dependency.artifactId === artifact.id) {
      fail(
        "self-dependency",
        `Artifact "${artifact.id}" declares itself as its own upstream`,
      );
      continue;
    }

    if (!allowed.includes(dependency.stage)) {
      fail(
        "impossible-stage-lineage",
        `Stage ${artifact.stage} cannot depend on stage ${dependency.stage}`,
      );
    }

    if (!resolve) continue;

    const upstream = resolve(dependency.artifactId);
    if (!upstream) {
      fail(
        "unknown-dependency",
        `Artifact "${artifact.id}" depends on "${dependency.artifactId}", which does not exist`,
      );
      continue;
    }

    if (
      artifact.projectId &&
      upstream.projectId &&
      upstream.projectId !== artifact.projectId
    ) {
      fail(
        "dependency-project-mismatch",
        `Artifact "${artifact.id}" depends on "${dependency.artifactId}", which belongs to another project`,
      );
    }

    if (upstream.stage !== dependency.stage) {
      // The declared stage is what makes lineage readable without resolving
      // the artifact, so a literal that misnames it records false lineage that
      // the allowed-stage and hash checks would both let through.
      fail(
        "dependency-stage-mismatch",
        `Artifact "${artifact.id}" declares "${dependency.artifactId}" as stage ${dependency.stage}, but it is ${upstream.stage}`,
      );
    }

    if (upstream.contentHash === undefined) {
      // A pre-envelope artifact has no durable identity, so nothing can claim
      // an exact binding to it. Accepting the caller's hash here would let a
      // new artifact assert provenance that was never recorded.
      fail(
        "dependency-without-identity",
        `Artifact "${artifact.id}" depends on "${dependency.artifactId}", which carries no content hash to bind to`,
      );
    } else if (upstream.contentHash !== dependency.contentHash) {
      // The upstream this artifact describes is not the upstream that exists
      // now. That is the whole point of recording the hash.
      fail(
        "dependency-hash-mismatch",
        `Artifact "${artifact.id}" was produced from a different version of "${dependency.artifactId}"`,
      );
    }

    if (upstream.reviewStatus === "rejected") {
      fail(
        "dependency-not-committed",
        `Artifact "${artifact.id}" depends on rejected artifact "${dependency.artifactId}"`,
      );
    }
  }

  return issues;
}
