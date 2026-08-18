import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

import { verifyWorldEntityReceipt } from "../studio/v2/StudioRuntime";
import { buildWorldModel } from "../validation/worldModel";
import { buildWorldScene } from "../validation/worldSceneBuilder";
import {
  carriesMaterializableWorldScene,
  expectedWorldInstancePath,
  isValidWorldInstanceName,
  MAX_WORLD_ATTRIBUTE_LENGTH,
  validateWorldScene,
  worldEntityNodeName,
  WORLD_SCENE_STAGE,
} from "../validation/worldSceneContract";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ArtifactStore } from "../pipeline/v2";
import type { StudioArtifactReceipt } from "../studio/v2/StudioTypes";
import type { TaskNode } from "../planning/model/TaskGraph";

/** ARTIFACT-CONTRACT-2 requires an owning project on every new artifact. */
const ARTIFACT_TEST_PROJECT = "artifact-contract-test-project";

/**
 * WORLD-1B — receipt verification and scene validation.
 *
 * The backend derives what it expects from the artifact **it sent**, so a
 * plugin cannot define its own success criteria by reporting whatever it built.
 */

const MATERIALIZER = readFileSync(
  join(process.cwd(), "studio-plugin/src/utils/WorldSceneMaterializer.lua"),
  "utf8",
);

function sources() {
  return {
    gameDesign: {
      gameplay: {
        mechanics: [{ name: "drifting" }],
        balance: { winCondition: "Cross the finish line first" },
      },
    },
    architecture: {
      architecture: { services: { SpawnService: "Places racers on the grid" } },
    },
  };
}

/** A minimal package the playability contract accepts. */
function playableScripts() {
  return [
    {
      path: "ServerScriptService/Arena.server.lua",
      content: `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progress = Instance.new("RemoteEvent")
progress.Name = "Progress"
progress.Parent = ReplicatedStorage

local arena = Instance.new("Folder")
arena.Name = "GeneratedArena"
arena.Parent = workspace

local pad = Instance.new("SpawnLocation")
pad.Anchored = true
pad.Parent = arena

local orb = Instance.new("Part")
orb.Name = "Orb"
orb.Anchored = true
orb.Parent = arena

orb.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if not player then
    return
  end
  orb:Destroy()
  progress:FireAllClients(1, 1)
end)
`,
    },
    {
      path: "StarterPlayerScripts/Hud.client.lua",
      content: `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Name = "Hud"
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Text = "Orbs: 0/1"
label.Parent = gui

ReplicatedStorage:WaitForChild("Progress").OnClientEvent:Connect(function(score, goal)
  label.Text = "Orbs: " .. tostring(score) .. "/" .. tostring(goal)
end)
`,
    },
  ];
}

function transferredArtifact() {
  const model = buildWorldModel(sources());
  return {
    id: "artifact-world",
    stage: WORLD_SCENE_STAGE,
    content: { ...model, scene: buildWorldScene(model) },
  };
}

/** Every entity the transferred scene declares, with its expected path. */
function truthfulReceipt(): StudioArtifactReceipt {
  const artifact = transferredArtifact();
  const worldEntities = artifact.content.scene.zones.flatMap((zone) =>
    zone.entities.map((entity) => ({
      entityId: entity.entityId,
      instancePath: expectedWorldInstancePath(
        WORLD_SCENE_STAGE,
        zone.zoneName,
        entity.node.name,
      ),
    })),
  );
  return { artifactId: "artifact-world", hash: "h", worldEntities };
}

function verify(receipt: StudioArtifactReceipt): string | null {
  return verifyWorldEntityReceipt(transferredArtifact(), receipt);
}

describe("WORLD-1B receipt verification", () => {
  it("accepts a receipt that matches the delivered scene exactly", () => {
    expect(verify(truthfulReceipt())).toBeNull();
  });

  it("rejects a missing entity receipt", () => {
    const receipt = truthfulReceipt();
    const worldEntities = receipt.worldEntities!.slice(1);
    expect(verify({ ...receipt, worldEntities })).toMatch(/missing a receipt/i);
  });

  it("rejects an extra entity receipt", () => {
    const receipt = truthfulReceipt();
    const worldEntities = [
      ...receipt.worldEntities!,
      { entityId: "not-in-the-scene", instancePath: "anywhere" },
    ];
    expect(verify({ ...receipt, worldEntities })).toMatch(/unexpected world/i);
  });

  it("rejects a duplicate entity receipt", () => {
    const receipt = truthfulReceipt();
    const worldEntities = [
      ...receipt.worldEntities!,
      receipt.worldEntities![0],
    ];
    expect(verify({ ...receipt, worldEntities })).toMatch(/duplicate/i);
  });

  it("rejects a wrong-path entity receipt", () => {
    const receipt = truthfulReceipt();
    const worldEntities = receipt.worldEntities!.map((entity, index) =>
      index === 0
        ? { ...entity, instancePath: "Workspace.SomewhereElse" }
        : entity,
    );
    expect(verify({ ...receipt, worldEntities })).toMatch(/instead of/i);
  });

  it("rejects a malformed entity receipt", () => {
    const receipt = truthfulReceipt();
    const worldEntities = [
      { entityId: "service-spawnservice" },
    ] as unknown as StudioArtifactReceipt["worldEntities"];
    expect(verify({ ...receipt, worldEntities })).toMatch(/malformed/i);
  });

  it("rejects no receipts at all when a scene was delivered", () => {
    // An older plugin cannot materialize the scene. Reporting that as success
    // is the failure this contract exists to prevent, so it fails explicitly
    // and the message names the likely cause.
    const receipt = truthfulReceipt();
    const error = verify({ ...receipt, worldEntities: undefined });

    expect(error).toMatch(/reported no entity receipts/i);
    expect(error).toMatch(/may not support the world scene contract/i);
  });

  it("imposes no requirement when the artifact carries no scene", () => {
    // A newer plugin against an older backend: no scene, so no world was
    // materialized and none is expected. Nothing claims otherwise.
    const model = buildWorldModel(sources());
    const error = verifyWorldEntityReceipt(
      { id: "artifact-world", stage: WORLD_SCENE_STAGE, content: model },
      { artifactId: "artifact-world", hash: "h" },
    );

    expect(error).toBeNull();
  });
});

describe("WORLD-1B scene validation happens before any mutation", () => {
  it("accepts what the builder produces", () => {
    expect(
      validateWorldScene(buildWorldScene(buildWorldModel(sources()))),
    ).toEqual([]);
  });

  it("rejects a class outside the allowlist", () => {
    const scene = buildWorldScene(buildWorldModel(sources()));
    const zones = structuredClone(scene.zones) as Array<{
      entities: Array<{ node: { className: string } }>;
    }>;
    zones[0].entities[0].node.className = "Part2";

    expect(validateWorldScene({ ...scene, zones }).join(" ")).toMatch(
      /class outside the allowlist/,
    );
  });

  it("rejects an executable class outright", () => {
    const scene = buildWorldScene(buildWorldModel(sources()));
    for (const className of ["Script", "LocalScript", "ModuleScript"]) {
      const zones = structuredClone(scene.zones) as Array<{
        entities: Array<{ node: { className: string } }>;
      }>;
      zones[0].entities[0].node.className = className;

      expect(validateWorldScene({ ...scene, zones }).join(" ")).toMatch(
        /class outside the allowlist/,
      );
    }
  });

  it("rejects a property outside the allowlist", () => {
    const scene = buildWorldScene(buildWorldModel(sources()));
    const zones = structuredClone(scene.zones) as Array<{
      entities: Array<{ node: { children: Array<{ properties: object }> } }>;
    }>;
    zones[0].entities[0].node.children[0].properties = {
      Source: { kind: "string", value: "while true do end" },
    };

    expect(validateWorldScene({ ...scene, zones }).join(" ")).toMatch(
      /property outside the allowlist: Source/,
    );
  });

  it("rejects a property value of the wrong type", () => {
    const scene = buildWorldScene(buildWorldModel(sources()));
    const zones = structuredClone(scene.zones) as Array<{
      entities: Array<{
        node: { children: Array<{ properties: Record<string, unknown> }> };
      }>;
    }>;
    zones[0].entities[0].node.children[0].properties.Size = {
      kind: "vector3",
      x: Number.POSITIVE_INFINITY,
      y: 1,
      z: 1,
    };

    expect(validateWorldScene({ ...scene, zones }).join(" ")).toMatch(
      /must carry finite x\/y\/z/,
    );
  });

  it("rejects an attribute outside the allowlist", () => {
    const scene = buildWorldScene(buildWorldModel(sources()));
    const zones = structuredClone(scene.zones) as Array<{
      entities: Array<{ node: { attributes: Record<string, unknown> } }>;
    }>;
    zones[0].entities[0].node.attributes.Source = {
      kind: "string",
      value: "x",
    };

    expect(validateWorldScene({ ...scene, zones }).join(" ")).toMatch(
      /attribute outside the allowlist/,
    );
  });

  it("rejects an attribute longer than the plugin will accept", () => {
    // Relation attributes are joined from the model, so their length grows
    // with it. Without the same bound on both sides, a large model passes
    // here and fails the whole export inside Studio.
    const scene = buildWorldScene(buildWorldModel(sources()));
    const zones = structuredClone(scene.zones) as Array<{
      entities: Array<{ node: { attributes: Record<string, unknown> } }>;
    }>;
    zones[0].entities[0].node.attributes.AIStudioWorldRelations = {
      kind: "string",
      value: "x".repeat(MAX_WORLD_ATTRIBUTE_LENGTH + 1),
    };

    expect(validateWorldScene({ ...scene, zones }).join(" ")).toMatch(
      /at most 1024 characters/,
    );
  });

  it("does not narrow a scene whose zones are not an array", () => {
    // Artifact content can be edited through SYNC_REQUEST after an export is
    // queued, so the guard must not let malformed zones reach an iteration
    // inside the report handler.
    const model = buildWorldModel(sources());
    expect(
      carriesMaterializableWorldScene({
        ...model,
        scene: { sceneVersion: 1, modelSchemaVersion: 1, zones: "nope" },
      }),
    ).toBe(false);
  });

  it("keeps a prefixed entity name inside the length limit", () => {
    const name = worldEntityNodeName(`-${"a".repeat(80)}`);
    expect(name.length).toBeLessThanOrEqual(50);
    expect(isValidWorldInstanceName(name)).toBe(true);
  });

  it("rejects the same semantic entity appearing twice", () => {
    const scene = buildWorldScene(buildWorldModel(sources()));
    const zones = structuredClone(scene.zones) as Array<{
      entities: Array<{ entityId: string }>;
    }>;
    zones[0].entities.push({ ...zones[0].entities[0] });

    expect(validateWorldScene({ ...scene, zones }).join(" ")).toMatch(
      /duplicate entityId/,
    );
  });
});

describe("WORLD-1B delivery path is actually wired", () => {
  /**
   * Every one of these was a real defect at first review. The materializer,
   * the routing predicate and the receipt shape all existed, and none of them
   * was reachable: the loader never dispatched, the sync manager dropped the
   * receipt, and the packager omitted the module. Contract tests passed
   * throughout, because they tested the parts rather than the path.
   */

  const LOADER = readFileSync(
    join(process.cwd(), "studio-plugin/src/utils/ArtifactLoader.lua"),
    "utf8",
  );
  const SYNC_MANAGER = readFileSync(
    join(process.cwd(), "studio-plugin/src/services/SyncManager.lua"),
    "utf8",
  );
  const PACKAGER = readFileSync(
    join(process.cwd(), "scripts/package-studio-plugin.ts"),
    "utf8",
  );

  it("dispatches a scene-carrying artifact to the world loader", () => {
    const dispatch = LOADER.slice(
      LOADER.indexOf("function ArtifactLoader:loadArtifact"),
      LOADER.indexOf("function ArtifactLoader:_loadLuaArtifact"),
    );

    expect(dispatch).toContain("self:_carriesWorldScene(artifact.content)");
    // MAR-002 made provenance import-scoped, so the dispatch carries the
    // identity of the export it belongs to. The routing itself is unchanged.
    expect(dispatch).toContain(
      "self:_loadWorldSceneArtifact(artifact, scoped)",
    );
    // Before the metadata fallback, or a scene would become a StringValue.
    expect(dispatch.indexOf("_loadWorldSceneArtifact")).toBeLessThan(
      dispatch.indexOf("_loadMetadataArtifact"),
    );
  });

  it("forwards the entity receipt from the loader to the report", () => {
    expect(SYNC_MANAGER).toContain("worldEntities = loaded.worldEntities");
  });

  it("refuses a container name taken by creator content", () => {
    // Before this, `_ensureStageFolder` destroyed a non-Folder instance named
    // `AIStudioArtifacts` or `WORLD_MODEL` outright — before any materializer
    // ownership precheck ran — so a creator who happened to use either name
    // lost it on the next export.
    const ensure = LOADER.slice(
      LOADER.indexOf("function ArtifactLoader:_ensureStageFolder"),
      LOADER.indexOf("function ArtifactLoader:_metadataInstanceName"),
    );

    // Both containers, counted rather than merely present: the root and the
    // stage folder are separate collisions and one refusal does not cover the
    // other.
    expect(ensure.match(/Refusing to replace/g)).toHaveLength(2);
    expect(ensure).not.toContain("root:Destroy()");
    expect(ensure).not.toContain("stageFolder:Destroy()");
  });

  it("packages the module the loader requires", () => {
    // A missing sibling makes `require` fail before the plugin can process
    // any export at all.
    expect(LOADER).toContain("require(script.Parent.WorldSceneMaterializer)");
    expect(PACKAGER).toContain("src/utils/WorldSceneMaterializer.lua");
  });
});

describe("WORLD-1B plugin-side guarantees", () => {
  /**
   * There is no Lua execution harness in this repository, so these assert the
   * guards exist in the delivered source rather than observing them run. They
   * are contract evidence, not runtime evidence — the operator session is what
   * closes that gap.
   */

  it("validates the whole scene before constructing anything", () => {
    const materialize = MATERIALIZER.slice(
      MATERIALIZER.indexOf("function WorldSceneMaterializer.materialize"),
    );
    const validateAt = materialize.indexOf("WorldSceneMaterializer.validate");
    const firstConstruction = materialize.indexOf("Instance.new");

    expect(validateAt).toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(firstConstruction);
  });

  it("refuses to replace an instance it does not own", () => {
    expect(MATERIALIZER).toContain("Refusing to replace");
    // MAR-002: the predicate now requires a matching project as well as the
    // managed mark, which is strictly stronger than what this pinned before.
    expect(MATERIALIZER).toContain(
      "not isOwnedBy(existingZone, provenance.projectId)",
    );
    expect(MATERIALIZER).toContain(
      "not isOwnedBy(existingEntity, provenance.projectId)",
    );
  });

  it("builds detached and discards roots that never attached", () => {
    expect(MATERIALIZER).toContain('local zoneRoot = Instance.new("Folder")');
    expect(MATERIALIZER).toContain("if not entry.attached then");
    expect(MATERIALIZER).toContain("entry.root:Destroy()");
  });

  it("sweeps managed zones that are no longer delivered", () => {
    expect(MATERIALIZER).toContain("not deliveredZones[child.Name]");
  });

  it("rescues creator content at any depth, into a container that survives rollback", () => {
    // Rescuing into the replacement root would put the creator's work inside
    // an instance the rollback destroys when the attach throws before it is
    // parented. The stage folder is already in the DataModel.
    expect(MATERIALIZER).toContain("collectUnmanagedDescendants");
    expect(MATERIALIZER).toContain(
      "preserveUnmanagedContent(existing, stageFolder)",
    );
    expect(MATERIALIZER).not.toContain(
      "preserveUnmanagedContent(existing, entry.root)",
    );
  });

  it("validates an entity name before using it as a table key", () => {
    const validate = MATERIALIZER.slice(
      MATERIALIZER.indexOf("function WorldSceneMaterializer.validate"),
    );
    const nameCheck = validate.indexOf("isValidInstanceName(entity.node.name)");
    const keyUse = validate.indexOf("seenNamesInZone[entity.node.name]");

    expect(nameCheck).toBeGreaterThan(-1);
    expect(nameCheck).toBeLessThan(keyUse);
  });
});

describe("WORLD-1B end-to-end recording", () => {
  it("records a scene the plugin contract would accept", async () => {
    const store = new ArtifactStore();
    const recorder = new GenerationArtifactRecorder(store);
    const node = (
      agent: string,
      output: Record<string, unknown>,
    ): TaskNode => ({
      id: `task-${agent}`,
      agent,
      type: "stage",
      input: {},
      dependencies: [],
      status: "done",
      priority: 1,
      output,
    });

    const recorded = await recorder.record(
      "world-scene-exec",
      [
        node("game_designer", sources().gameDesign as Record<string, unknown>),
        node(
          "roblox_architect",
          sources().architecture as Record<string, unknown>,
        ),
        // Playable Lua, because the recorder refuses to persist anything for a
        // run that fails the playability contract — including this scene.
        node("lua_generator", { scripts: playableScripts() }),
      ],
      ARTIFACT_TEST_PROJECT,
    );

    const artifact = recorded.find((entry) => entry.stage === "WORLD_MODEL");
    const content = artifact?.content as { scene?: unknown };

    expect(validateWorldScene(content.scene)).toEqual([]);
  });
});
