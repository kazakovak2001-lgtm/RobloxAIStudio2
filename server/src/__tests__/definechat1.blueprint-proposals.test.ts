/**
 * DEFINE-CHAT-1 / CHAT-BLUEPRINT-DISCONNECT-001 — a stated change must be a real one.
 *
 * The Define conversation persisted a user message, an assistant reply and
 * nothing else. An assistant could therefore say it had changed the design
 * while the next generation still consumed the old blueprint, and nothing in
 * the system disagreed with it.
 *
 * A proposal turns the claim into a thing that can be checked: it names exactly
 * which fields would change, it is visible before anyone acts on it, and until
 * it is accepted it has no effect on any generation. Accepting one applies the
 * change and versions the result in a single transaction, so the design a run
 * later consumes is traceable to the decision that produced it.
 */

import { describe, expect, it } from "vitest";
import {
  BlueprintProposalError,
  GameGenerationService,
} from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  PipelineEventEmitter,
  StreamingUpdateHandler,
} from "../socket/streaming";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ArtifactStore } from "../pipeline/v2";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import type { CreateBlueprintInput } from "../projects/types/blueprint";

const PROJECT = "project-alpha";
const OWNER = "owner-alpha";

function input(): CreateBlueprintInput {
  return {
    project_id: PROJECT,
    user_id: OWNER,
    name: "Ruins of the Storm Core",
    description: "A mountain research complex with exactly three cores.",
    game_type: "adventure",
    genre: ["exploration"],
    difficulty: "medium",
    estimated_players: "solo",
    target_audience: "all ages",
  } as CreateBlueprintInput;
}

async function fixture() {
  const storage = new InMemoryStorageProvider();
  const repository = new InMemoryBlueprintRepository(storage);
  const service = new GameGenerationService(
    repository,
    new BlueprintCache(),
    new StreamingUpdateHandler(new PipelineEventEmitter()),
    new PipelineEventEmitter(),
    undefined,
    new AgentRegistry(),
    new ArtifactStore(),
  );
  const blueprint = await service.createBlueprint(OWNER, PROJECT, input());
  return { storage, service, blueprint };
}

describe("DEFINE-CHAT-1 blueprint change proposals", () => {
  it("records a proposal without changing the design", async () => {
    const f = await fixture();

    const proposal = await f.service.proposeBlueprintChange(
      f.blueprint.id,
      "assistant",
      { description: "Make it an underwater station with two beacons." },
      "The user asked to move it underwater.",
    );

    expect(proposal.status).toBe("pending");
    // This is the whole point: stating a change is not making one.
    const blueprint = await f.service.getBlueprint(f.blueprint.id);
    expect(blueprint?.description).toBe(
      "A mountain research complex with exactly three cores.",
    );
  });

  it("applies the change and versions the result when accepted", async () => {
    const f = await fixture();
    const proposal = await f.service.proposeBlueprintChange(
      f.blueprint.id,
      "assistant",
      { description: "An underwater station with two beacons." },
    );

    const result = await f.service.acceptBlueprintProposal(proposal.id, OWNER);

    expect(result.blueprint.description).toBe(
      "An underwater station with two beacons.",
    );
    // The version records the design after the change, not before it, so the
    // decision and its effect are traceable to each other.
    expect(result.version.snapshot.description).toBe(
      "An underwater station with two beacons.",
    );
    expect(result.version.snapshot_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("links the accepted proposal to the version it produced", async () => {
    const f = await fixture();
    const proposal = await f.service.proposeBlueprintChange(
      f.blueprint.id,
      "assistant",
      { target_audience: "teens" },
    );

    const result = await f.service.acceptBlueprintProposal(proposal.id, OWNER);

    const [stored] = await f.service.listBlueprintProposals(PROJECT);
    expect(stored.status).toBe("accepted");
    expect(stored.decided_by).toBe(OWNER);
    expect(stored.applied_version_id).toBe(result.version.id);
  });

  it("leaves the design alone when a proposal is rejected", async () => {
    const f = await fixture();
    const proposal = await f.service.proposeBlueprintChange(
      f.blueprint.id,
      "assistant",
      { description: "Something the user did not want." },
    );

    const rejected = await f.service.rejectBlueprintProposal(
      proposal.id,
      OWNER,
    );

    expect(rejected.status).toBe("rejected");
    const blueprint = await f.service.getBlueprint(f.blueprint.id);
    expect(blueprint?.description).toBe(
      "A mountain research complex with exactly three cores.",
    );
  });

  it("refuses to decide the same proposal twice", async () => {
    const f = await fixture();
    const proposal = await f.service.proposeBlueprintChange(
      f.blueprint.id,
      "assistant",
      { description: "Applied once." },
    );
    await f.service.acceptBlueprintProposal(proposal.id, OWNER);

    await expect(
      f.service.acceptBlueprintProposal(proposal.id, OWNER),
    ).rejects.toBeInstanceOf(BlueprintProposalError);
    await expect(
      f.service.rejectBlueprintProposal(proposal.id, OWNER),
    ).rejects.toBeInstanceOf(BlueprintProposalError);
  });

  it("refuses a proposal that changes nothing", async () => {
    const f = await fixture();

    // A proposal carrying only fields it is not allowed to touch is not a
    // design change, and recording it would suggest something is pending.
    await expect(
      f.service.proposeBlueprintChange(f.blueprint.id, "assistant", {
        id: "somewhere-else",
        project_id: "another-project",
      }),
    ).rejects.toBeInstanceOf(BlueprintProposalError);
  });

  it("cannot move a blueprint to another project through a proposal", async () => {
    const f = await fixture();
    const proposal = await f.service.proposeBlueprintChange(
      f.blueprint.id,
      "assistant",
      {
        description: "A legitimate edit.",
        project_id: "another-project",
        user_id: "someone-else",
      },
    );

    const result = await f.service.acceptBlueprintProposal(proposal.id, OWNER);

    // Identity and ownership are not design, so the review path is not a way to
    // reassign them.
    expect(result.blueprint.project_id).toBe(PROJECT);
    expect(result.blueprint.user_id).toBe(OWNER);
    expect(result.blueprint.description).toBe("A legitimate edit.");
  });

  it("makes an accepted change the design the next run consumes", async () => {
    const f = await fixture();
    const proposal = await f.service.proposeBlueprintChange(
      f.blueprint.id,
      "assistant",
      { description: "The design the run should use." },
    );
    await f.service.acceptBlueprintProposal(proposal.id, OWNER);

    const prepared = await f.service.prepareGeneration(f.blueprint.id, OWNER);

    // Before this, an assistant could claim a change and the next generation
    // would still consume the old design.
    expect(prepared.blueprint.description).toBe(
      "The design the run should use.",
    );
    expect(prepared.execution.blueprint_snapshot_hash).toBeTruthy();
  });
});
