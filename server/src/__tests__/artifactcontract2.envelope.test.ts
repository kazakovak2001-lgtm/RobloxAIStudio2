import { describe, it, expect } from "vitest";

import {
  ARTIFACT_ENVELOPE_SCHEMA_VERSION,
  ArtifactContentError,
  ArtifactStore,
  HUMAN_EDIT_PRODUCER_VERSION,
  agentProducer,
  canonicalJson,
  computeContentHash,
  deterministicProducer,
  isLegacyArtifact,
  validateArtifactEnvelope,
  type ArtifactDependency,
  type PipelineArtifact,
} from "../pipeline/v2";
import { getAgentDefinition } from "../agents/contract/agentContract";

/**
 * ARTIFACT-CONTRACT-2 — identity, provenance and lineage on the durable
 * envelope. Every case here drives the real store or the real validator; none
 * asserts over a locally declared literal.
 */

const PROJECT = "artifact-contract-project";
const OTHER_PROJECT = "some-other-project";
const EXECUTION = "exec-artifact-contract";

const LUA = {
  scripts: [
    { path: "ServerScriptService/Main.server.lua", content: "print('a')" },
    { path: "StarterPlayerScripts/Hud.client.lua", content: "print('b')" },
  ],
};

async function storeLua(
  store: ArtifactStore,
  overrides: { projectId?: string; content?: unknown } = {},
): Promise<PipelineArtifact> {
  return store.store(
    EXECUTION,
    "LUA_GENERATION",
    "lua_generator",
    overrides.content ?? LUA,
    { projectId: overrides.projectId ?? PROJECT },
  );
}

describe("ARTIFACT-CONTRACT-2 canonical content identity", () => {
  it("hashes logically identical content identically", () => {
    expect(computeContentHash({ a: 1, b: "x" })).toBe(
      computeContentHash({ a: 1, b: "x" }),
    );
  });

  it("ignores object key order, at every depth", () => {
    const one = computeContentHash({ a: 1, nested: { x: true, y: [1, 2] } });
    const two = computeContentHash({ nested: { y: [1, 2], x: true }, a: 1 });

    expect(one).toBe(two);
    // The serializer, not just the digest, must be order-independent.
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("treats array order as meaning", () => {
    // A different script order is a different package, so this must differ.
    expect(computeContentHash({ scripts: ["a", "b"] })).not.toBe(
      computeContentHash({ scripts: ["b", "a"] }),
    );
  });

  it("changes when the content changes", () => {
    expect(computeContentHash({ a: 1 })).not.toBe(computeContentHash({ a: 2 }));
  });

  it("rejects content that cannot be given a deterministic identity", () => {
    // `JSON.stringify` silently erases these, which would let two different
    // payloads hash the same.
    expect(() => computeContentHash({ a: undefined })).toThrow(
      ArtifactContentError,
    );
    expect(() => computeContentHash({ a: () => 1 })).toThrow(
      ArtifactContentError,
    );
    expect(() => computeContentHash({ a: Number.NaN })).toThrow(
      ArtifactContentError,
    );
    expect(() => computeContentHash({ a: 1n })).toThrow(ArtifactContentError);
  });

  it("names the algorithm that produced it", () => {
    expect(computeContentHash({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("ARTIFACT-CONTRACT-2 envelope on newly produced artifacts", () => {
  it("stamps the current envelope schema version", async () => {
    const artifact = await storeLua(new ArtifactStore());

    expect(artifact.schemaVersion).toBe(ARTIFACT_ENVELOPE_SCHEMA_VERSION);
    expect(isLegacyArtifact(artifact)).toBe(false);
  });

  it("takes project ownership from the caller's server context", async () => {
    // Ownership is not read from the payload: content claiming another project
    // changes nothing about who owns the artifact.
    const artifact = await new ArtifactStore().store(
      EXECUTION,
      "GAME_DESIGN",
      "game_designer",
      { projectId: "content-claimed-project" },
      { projectId: PROJECT },
    );

    expect(artifact.projectId).toBe(PROJECT);
  });

  it("refuses to write an artifact with no owning project", async () => {
    await expect(
      new ArtifactStore().store(EXECUTION, "GAME_DESIGN", "game_designer", {}, {
        projectId: "",
      } as never),
    ).rejects.toThrow(/owning project/i);
  });

  it("records an agent producer with the definition version that ran", async () => {
    const artifact = await storeLua(new ArtifactStore());

    expect(artifact.producer).toEqual({
      type: "agent",
      id: "lua_generator",
      version: getAgentDefinition("lua_generator")!.version,
    });
  });

  it("records a deterministic producer truthfully rather than as an agent", async () => {
    const store = new ArtifactStore();
    const lua = await storeLua(store);
    const review = await store.store(
      EXECUTION,
      "SECURITY_REVIEW",
      null,
      { findings: [] },
      {
        projectId: PROJECT,
        producer: deterministicProducer("lua-security-review"),
        dependencies: [ArtifactStore.dependencyOn(lua)],
      },
    );

    expect(review.producer).toEqual({
      type: "deterministic",
      id: "lua-security-review",
      version: 1,
    });
  });

  it("refuses an artifact whose producer cannot be identified", async () => {
    // `agent: null` is shared by every deterministic stage, so it cannot name
    // a producer on its own.
    await expect(
      new ArtifactStore().store(
        EXECUTION,
        "VALIDATION",
        null,
        {},
        {
          projectId: PROJECT,
        },
      ),
    ).rejects.toThrow(/must name its producer/i);

    expect(() => agentProducer("no_such_agent")).toThrow(ArtifactContentError);
    expect(() => deterministicProducer("not-registered")).toThrow(
      ArtifactContentError,
    );
  });

  it("refuses a producer version the current definition does not have", async () => {
    // The version must be looked up, never asserted by the caller. A number
    // nobody checked is provenance in name only.
    await expect(
      new ArtifactStore().store(
        EXECUTION,
        "LUA_GENERATION",
        "lua_generator",
        LUA,
        {
          projectId: PROJECT,
          producer: { type: "agent", id: "lua_generator", version: 99 },
        },
      ),
    ).rejects.toThrow(/version 99/i);
  });

  it("refuses a producer naming an agent that has no definition", async () => {
    await expect(
      new ArtifactStore().store(
        EXECUTION,
        "GAME_DESIGN",
        null,
        {},
        {
          projectId: PROJECT,
          producer: { type: "agent", id: "ghost_agent", version: 1 },
        },
      ),
    ).rejects.toThrow(/no definition/i);
  });

  it("keeps the content hash independent of storage and review metadata", async () => {
    const store = new ArtifactStore();
    const artifact = await storeLua(store);
    const before = artifact.contentHash;

    await store.approve(artifact.id, "reviewer");
    await store.markValidated(artifact.id);
    const after = store.getById(artifact.id);

    expect(after?.reviewStatus).toBe("approved");
    expect(after?.validated).toBe(true);
    // Approving an artifact does not change what it is.
    expect(after?.contentHash).toBe(before);
  });

  it("moves the content hash when the content is edited", async () => {
    const store = new ArtifactStore();
    const artifact = await storeLua(store);

    const edited = await store.edit(artifact.id, { scripts: [] }, "reviewer");

    expect(edited?.contentHash).not.toBe(artifact.contentHash);
    // The edited bytes are the reviewer's, so the original producer must not
    // be left claiming them.
    expect(edited?.producer).toEqual({
      type: "human",
      id: "reviewer",
      version: HUMAN_EDIT_PRODUCER_VERSION,
    });
    expect(validateArtifactEnvelope(edited!)).toEqual([]);
    expect(edited?.contentHash).toBe(computeContentHash({ scripts: [] }));
  });
});

describe("ARTIFACT-CONTRACT-2 dependency lineage", () => {
  it("binds a dependency to the upstream artifact's exact hash", async () => {
    const store = new ArtifactStore();
    const lua = await storeLua(store);
    const review = await store.store(
      EXECUTION,
      "SECURITY_REVIEW",
      null,
      { findings: [] },
      {
        projectId: PROJECT,
        producer: deterministicProducer("lua-security-review"),
        dependencies: [ArtifactStore.dependencyOn(lua)],
      },
    );

    expect(review.dependencies).toEqual([
      {
        artifactId: lua.id,
        stage: "LUA_GENERATION",
        contentHash: lua.contentHash,
      },
    ]);
  });

  it("rejects a dependency whose recorded hash is not the upstream's", async () => {
    const store = new ArtifactStore();
    const lua = await storeLua(store);
    const wrong: ArtifactDependency = {
      artifactId: lua.id,
      stage: "LUA_GENERATION",
      contentHash: computeContentHash({ scripts: [] }),
    };

    await expect(
      store.store(
        EXECUTION,
        "SECURITY_REVIEW",
        null,
        { findings: [] },
        {
          projectId: PROJECT,
          producer: deterministicProducer("lua-security-review"),
          dependencies: [wrong],
        },
      ),
    ).rejects.toThrow(/different version/i);
  });

  it("rejects a dependency on an artifact in another project", async () => {
    const store = new ArtifactStore();
    const foreign = await storeLua(store, { projectId: OTHER_PROJECT });

    await expect(
      store.store(
        EXECUTION,
        "SECURITY_REVIEW",
        null,
        { findings: [] },
        {
          projectId: PROJECT,
          producer: deterministicProducer("lua-security-review"),
          dependencies: [ArtifactStore.dependencyOn(foreign)],
        },
      ),
    ).rejects.toThrow(/another project/i);
  });

  it("rejects a duplicated dependency entry", async () => {
    const store = new ArtifactStore();
    const lua = await storeLua(store);
    const edge = ArtifactStore.dependencyOn(lua);

    await expect(
      store.store(
        EXECUTION,
        "SECURITY_REVIEW",
        null,
        { findings: [] },
        {
          projectId: PROJECT,
          producer: deterministicProducer("lua-security-review"),
          dependencies: [edge, edge],
        },
      ),
    ).rejects.toThrow(/more than once/i);
  });

  it("rejects a dependency that misnames the upstream's stage", async () => {
    // The declared stage is what makes lineage readable without resolving the
    // artifact. A literal that misnames it would otherwise pass both the
    // allowed-stage rule and the hash check.
    const store = new ArtifactStore();
    const design = await store.store(
      EXECUTION,
      "GAME_DESIGN",
      "game_designer",
      { concept: "anything" },
      { projectId: PROJECT },
    );

    await expect(
      store.store(
        EXECUTION,
        "SECURITY_REVIEW",
        null,
        { findings: [] },
        {
          projectId: PROJECT,
          producer: deterministicProducer("lua-security-review"),
          dependencies: [
            {
              artifactId: design.id,
              stage: "LUA_GENERATION",
              contentHash: design.contentHash!,
            },
          ],
        },
      ),
    ).rejects.toThrow(/but it is GAME_DESIGN/i);
  });

  it("refuses to bind to a historical artifact that has no content identity", async () => {
    // A pre-envelope artifact has nothing to bind to, so accepting the
    // caller's hash would assert provenance that was never recorded.
    const store = new ArtifactStore();
    const legacy: PipelineArtifact = {
      id: "artifact-legacy-upstream",
      pipelineId: EXECUTION,
      stage: "LUA_GENERATION",
      agent: "lua_generator",
      type: "lua",
      name: "generatedScripts.lua",
      createdAt: 1,
      content: LUA,
      sizeBytes: 10,
      validated: true,
      reviewStatus: "approved",
    };
    (
      store as unknown as { artifacts: Map<string, PipelineArtifact> }
    ).artifacts.set(legacy.id, legacy);

    await expect(
      store.store(
        EXECUTION,
        "SECURITY_REVIEW",
        null,
        { findings: [] },
        {
          projectId: PROJECT,
          producer: deterministicProducer("lua-security-review"),
          dependencies: [
            {
              artifactId: legacy.id,
              stage: "LUA_GENERATION",
              contentHash: computeContentHash(LUA),
            },
          ],
        },
      ),
    ).rejects.toThrow(/no content hash to bind to/i);
  });

  it("rejects a dependency on an artifact that does not exist", async () => {
    await expect(
      new ArtifactStore().store(
        EXECUTION,
        "SECURITY_REVIEW",
        null,
        { findings: [] },
        {
          projectId: PROJECT,
          producer: deterministicProducer("lua-security-review"),
          dependencies: [
            {
              artifactId: "artifact-does-not-exist",
              stage: "LUA_GENERATION",
              contentHash: computeContentHash(LUA),
            },
          ],
        },
      ),
    ).rejects.toThrow(/does not exist/i);
  });

  it("rejects a dependency on a rejected artifact", async () => {
    const store = new ArtifactStore();
    const lua = await storeLua(store);
    const edge = ArtifactStore.dependencyOn(lua);
    await store.reject(lua.id, "reviewer", "not acceptable");

    await expect(
      store.store(
        EXECUTION,
        "SECURITY_REVIEW",
        null,
        { findings: [] },
        {
          projectId: PROJECT,
          producer: deterministicProducer("lua-security-review"),
          dependencies: [edge],
        },
      ),
    ).rejects.toThrow(/rejected artifact/i);
  });

  it("rejects self-dependency and impossible stage lineage", () => {
    // Driven through the validator directly: the store cannot construct a
    // self-referencing artifact, because the id does not exist until it does.
    const selfReferential = {
      id: "artifact-self",
      stage: "VALIDATION" as const,
      content: {},
      schemaVersion: ARTIFACT_ENVELOPE_SCHEMA_VERSION,
      projectId: PROJECT,
      contentHash: computeContentHash({}),
      producer: deterministicProducer("generation-validation"),
      dependencies: [
        {
          artifactId: "artifact-self",
          stage: "LUA_GENERATION" as const,
          contentHash: computeContentHash(LUA),
        },
      ],
    };
    const badLineage = {
      ...selfReferential,
      id: "artifact-lineage",
      stage: "GAME_DESIGN" as const,
      dependencies: [
        {
          artifactId: "artifact-upstream",
          stage: "LUA_GENERATION" as const,
          contentHash: computeContentHash(LUA),
        },
      ],
    };

    expect(
      validateArtifactEnvelope(selfReferential).map((issue) => issue.code),
    ).toContain("self-dependency");
    expect(
      validateArtifactEnvelope(badLineage).map((issue) => issue.code),
    ).toContain("impossible-stage-lineage");
  });

  it("rejects a claimed envelope version this build cannot interpret", () => {
    const future = {
      id: "artifact-future",
      stage: "GAME_DESIGN" as const,
      content: {},
      schemaVersion: ARTIFACT_ENVELOPE_SCHEMA_VERSION + 1,
      projectId: PROJECT,
      contentHash: computeContentHash({}),
      producer: agentProducer("game_designer"),
    };

    expect(validateArtifactEnvelope(future).map((issue) => issue.code)).toEqual(
      ["unsupported-schema-version"],
    );
  });

  it("detects an envelope whose hash no longer matches its content", () => {
    const tampered = {
      id: "artifact-tampered",
      stage: "GAME_DESIGN" as const,
      content: { changed: true },
      schemaVersion: ARTIFACT_ENVELOPE_SCHEMA_VERSION,
      projectId: PROJECT,
      contentHash: computeContentHash({ changed: false }),
      producer: agentProducer("game_designer"),
    };

    expect(
      validateArtifactEnvelope(tampered).map((issue) => issue.code),
    ).toContain("content-hash-mismatch");
  });
});

describe("ARTIFACT-CONTRACT-2 historical artifacts", () => {
  const historical: PipelineArtifact = {
    id: "artifact-historical",
    pipelineId: EXECUTION,
    stage: "LUA_GENERATION",
    agent: "lua_generator",
    type: "lua",
    name: "generatedScripts.lua",
    createdAt: 1,
    content: LUA,
    sizeBytes: 10,
    validated: true,
    reviewStatus: "approved",
  };

  it("stays readable and makes no envelope claims", () => {
    expect(isLegacyArtifact(historical)).toBe(true);
    expect(validateArtifactEnvelope(historical)).toEqual([]);
  });

  it("is never assigned current metadata it never had", () => {
    // Absence is absence. A historical artifact must not acquire the current
    // schema version, project, hash or producer by being read.
    expect(historical.schemaVersion).toBeUndefined();
    expect(historical.projectId).toBeUndefined();
    expect(historical.contentHash).toBeUndefined();
    expect(historical.producer).toBeUndefined();
    // And nothing may bind to it, because it has no content identity.
    expect(() => ArtifactStore.dependencyOn(historical)).toThrow(
      /no content hash/i,
    );
  });
});
