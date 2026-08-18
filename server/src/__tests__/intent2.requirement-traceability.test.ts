/**
 * INTENT-2 / INTENT-FIDELITY-001 — requirements that can be named and checked.
 *
 * Requirements reached downstream agents as an opaque object of plain strings.
 * Nothing carried identity, so nothing could ask whether a specific constraint
 * had survived planning, design and generation. The only answer available was
 * prose, and prose cannot be checked.
 *
 * This slice gives requirements identity where they are produced, and measures
 * how many of them the run can actually show evidence for. The measured number
 * is currently low, because the chain does not yet carry identifiers past the
 * requirements stage. That is the point: the gap becomes a number recorded on
 * the run rather than an assumption about it, and each agent that starts citing
 * requirement identifiers will move it.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateRequirementCoverage,
  identifyRequirements,
} from "../validation/requirementTraceability";
import { RequirementsAgent } from "../agents/implementations/RequirementsAgent";
import type { RequirementSpec } from "../types/blueprint";

describe("INTENT-2 requirement identity", () => {
  it("gives every requirement a stable identifier", () => {
    const specs = identifyRequirements({
      functional: ["Collect exactly three cores", "Escape the storm"],
      constraints: ["Must run on Roblox"],
      success_criteria: ["Player completes the loop"],
      non_functional: { performance: "60fps" },
    });

    expect(specs.map((spec) => spec.id)).toEqual([
      "R-001",
      "R-002",
      "R-003",
      "R-004",
      "R-005",
    ]);
    expect(specs.map((spec) => spec.kind)).toEqual([
      "functional",
      "functional",
      "constraint",
      "success_criterion",
      "non_functional",
    ]);
  });

  it("marks a requirement built on an assumed value as derived", () => {
    const specs = identifyRequirements(
      {
        functional: [
          "Core gameplay loop for simulator",
          "Collect exactly three cores",
        ],
      },
      // The user never chose "simulator"; it is the default the system filled
      // in, so a requirement echoing it is not something they asked for.
      ["simulator"],
    );

    expect(specs[0]).toMatchObject({ source: "derived" });
    expect(specs[1]).toMatchObject({ source: "user-stated" });
  });

  it("returns nothing rather than inventing identity for a missing set", () => {
    expect(identifyRequirements(undefined)).toEqual([]);
    expect(identifyRequirements({})).toEqual([]);
  });
});

describe("INTENT-2 requirement coverage", () => {
  const specs: RequirementSpec[] = [
    {
      id: "R-001",
      text: "Three cores",
      kind: "functional",
      source: "user-stated",
    },
    {
      id: "R-002",
      text: "Storm lock",
      kind: "functional",
      source: "user-stated",
    },
  ];

  it("counts a requirement as covered only when downstream names it", () => {
    const coverage = evaluateRequirementCoverage(specs, [
      {
        design: "The objective R-001 is satisfied by three collectible cores.",
      },
    ]);

    expect(coverage).toEqual({
      total: 2,
      covered: 1,
      uncoveredIds: ["R-002"],
    });
  });

  it("names the uncovered requirements rather than reporting a percentage", () => {
    const coverage = evaluateRequirementCoverage(specs, [
      { design: "A design that cites nothing." },
    ]);

    // A run that cannot show evidence for a requirement has not satisfied it,
    // and the useful output is which ones.
    expect(coverage.uncoveredIds).toEqual(["R-001", "R-002"]);
    expect(coverage.covered).toBe(0);
  });

  it("reports nothing when there were no requirements to trace", () => {
    expect(evaluateRequirementCoverage([], [{ anything: true }])).toEqual({
      total: 0,
      covered: 0,
      uncoveredIds: [],
    });
  });

  it("survives an artifact that cannot be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    // Skipping it can only under-report coverage, which is the safe direction.
    const coverage = evaluateRequirementCoverage(specs, [circular]);
    expect(coverage.uncoveredIds).toEqual(["R-001", "R-002"]);
  });
});

describe("INTENT-2 requirements agent output", () => {
  it("attaches identity without changing the shape downstream reads", async () => {
    const agent = new RequirementsAgent();

    const output = (await agent.execute({
      blueprint: {
        name: "Ruins of the Storm Core",
        genre: ["exploration"],
        game_type: "adventure",
        description: "Collect exactly three cores.",
      },
    })) as { data: Record<string, unknown> };

    // The existing key is untouched, because every downstream agent reads it.
    expect(output.data.requirements).toBeTruthy();
    const specs = output.data.requirement_specs as RequirementSpec[];
    expect(Array.isArray(specs)).toBe(true);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs[0].id).toBe("R-001");
  });

  it("marks requirements derived from assumed blueprint fields", async () => {
    const agent = new RequirementsAgent();

    const output = (await agent.execute({
      blueprint: {
        name: "Untitled",
        genre: ["simulator"],
        game_type: "simulator",
        description: "",
        assumed_fields: ["game_type", "genre"],
      },
    })) as { data: Record<string, unknown> };

    const specs = output.data.requirement_specs as RequirementSpec[];
    // The fallback requirements are phrased around the game type, which nobody
    // chose here, so they must not be reported as user-stated.
    expect(specs.some((spec) => spec.source === "derived")).toBe(true);
  });
});
