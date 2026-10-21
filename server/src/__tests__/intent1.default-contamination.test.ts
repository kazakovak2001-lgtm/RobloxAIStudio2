/**
 * INTENT-1 / INTENT-DEFAULT-CONTAMINATION-001 — an assumption is not a requirement.
 *
 * A project created without a genre arrived downstream indistinguishable from
 * one where the user chose that genre deliberately. The blueprint builder also
 * invented a description, so a project with no brief carried a sentence that
 * reads exactly like a user requirement and is not one. Agents then designed
 * against those values, which is how an adventure brief could be generated as
 * something else entirely.
 *
 * The builder still has to fill gaps, because the blueprint contract requires a
 * game type, a genre, a difficulty and a player count. What it must not do is
 * present the fills as user intent, so every gap it closes is named.
 */

import { describe, expect, it } from "vitest";
import { buildProjectBlueprintInput } from "../routes/game-generation";
import type { SaaSProject } from "../platform/projects/SaaSProjectRepository";

function project(overrides: Partial<SaaSProject> = {}): SaaSProject {
  return {
    id: "project-alpha",
    ownerId: "owner-alpha",
    name: "Ruins of the Storm Core",
    description: "",
    genre: "",
    status: "draft",
    qualityScore: 0,
    generationCount: 0,
    scriptCount: 0,
    assetCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as SaaSProject;
}

describe("INTENT-1 default contamination", () => {
  it("names every field it had to assume", () => {
    const input = buildProjectBlueprintInput(project());

    expect(input.assumed_fields).toEqual(
      expect.arrayContaining([
        "game_type",
        "difficulty",
        "estimated_players",
        "genre",
        "description",
        "target_audience",
      ]),
    );
  });

  it("assumes nothing when the user stated everything", () => {
    const input = buildProjectBlueprintInput(
      project({
        description: "A mountain research complex with exactly three cores.",
        genre: "adventure",
        gameType: "exploration",
        difficulty: "hard",
        players: "solo",
        targetAudience: "teens",
      }),
    );

    expect(input.assumed_fields).toEqual([]);
    expect(input.description).toBe(
      "A mountain research complex with exactly three cores.",
    );
    expect(input.game_type).toBe("exploration");
    expect(input.difficulty).toBe("hard");
    expect(input.estimated_players).toBe("solo");
    expect(input.target_audience).toBe("teens");
  });

  it("does not invent a description for a project with no brief", () => {
    const input = buildProjectBlueprintInput(project());

    // This used to read "Create a complete playable adventure Roblox
    // experience", which is indistinguishable from something the user wrote.
    expect(input.description).toBe("");
    expect(input.assumed_fields).toContain("description");
  });

  it("keeps a stated value out of the assumed list even when others are filled", () => {
    const input = buildProjectBlueprintInput(
      project({ genre: "horror", difficulty: "extreme" }),
    );

    expect(input.assumed_fields).not.toContain("genre");
    expect(input.assumed_fields).not.toContain("difficulty");
    expect(input.assumed_fields).toContain("estimated_players");
    expect(input.genre).toEqual(["horror"]);
  });

  it("treats an unrecognised difficulty as an assumption, not a choice", () => {
    const input = buildProjectBlueprintInput(
      project({ difficulty: "impossible" }),
    );

    // The value cannot be honoured, so the blueprint carries the default and
    // says it is one rather than implying the user picked medium.
    expect(input.difficulty).toBe("medium");
    expect(input.assumed_fields).toContain("difficulty");
  });

  it("still satisfies the fields the blueprint contract requires", () => {
    const input = buildProjectBlueprintInput(project());

    // Naming a value as assumed must not mean leaving it unset: the contract
    // still needs these, and a missing one would fail validation later.
    expect(input.game_type).toBeTruthy();
    expect(input.genre.length).toBeGreaterThan(0);
    expect(input.difficulty).toBeTruthy();
    expect(input.estimated_players).toBeTruthy();
    expect(input.target_audience).toBeTruthy();
  });
});
