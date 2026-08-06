import { describe, expect, it } from "vitest";
import type { SaaSProject } from "../../platform/projects/SaaSProjectRepository";
import { buildProjectBlueprintInput } from "../game-generation";

describe("game generation project blueprint", () => {
  it("preserves the owner's project brief instead of creating generic metadata", () => {
    const project: SaaSProject = {
      id: "proj-runtime",
      ownerId: "owner-1",
      name: "Ollama Runtime Acceptance",
      description:
        "Create a spawn area, collectibles, score UI, and a clear objective.",
      gameType: "adventure",
      genre: "exploration",
      difficulty: "hard",
      players: "solo",
      targetAudience: "all ages",
      status: "draft",
      qualityScore: 0,
      generationCount: 0,
      scriptCount: 0,
      assetCount: 0,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(buildProjectBlueprintInput(project)).toMatchObject({
      project_id: "proj-runtime",
      user_id: "owner-1",
      name: "Ollama Runtime Acceptance",
      description: project.description,
      game_type: "adventure",
      genre: ["exploration"],
      difficulty: "hard",
      estimated_players: "solo",
      target_audience: "all ages",
    });
  });

  it("uses safe generation defaults for incomplete legacy project metadata", () => {
    const project = {
      id: "proj-legacy",
      ownerId: "owner-1",
      name: "Legacy Project",
      description: "   ",
      genre: "obby",
      difficulty: "impossible",
      players: "many",
      status: "draft",
      qualityScore: 0,
      generationCount: 0,
      scriptCount: 0,
      assetCount: 0,
      createdAt: 1,
      updatedAt: 1,
    } as SaaSProject;

    expect(buildProjectBlueprintInput(project)).toMatchObject({
      game_type: "obby",
      description: "Create a complete playable obby Roblox experience.",
      difficulty: "medium",
      estimated_players: "small-group",
    });
  });
});
