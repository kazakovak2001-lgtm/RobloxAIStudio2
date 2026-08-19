import { describe, it, expect } from "vitest";
import { SemanticRetriever } from "../SemanticRetriever";

describe("SemanticRetriever project isolation", () => {
  it("does not return another project's document for the same shared agentId", () => {
    const retriever = new SemanticRetriever();

    // Two distinct projects both use the same fixed agent role, as every
    // production bridge does (e.g. agentId "world-intelligence").
    retriever.index(
      "world-intelligence",
      "secret dungeon layout for project alpha",
      { secret: "alpha-only" },
      "project-alpha",
    );
    retriever.index(
      "world-intelligence",
      "secret dungeon layout for project beta",
      { secret: "beta-only" },
      "project-beta",
    );

    const betaResults = retriever.search(
      "world-intelligence",
      "secret dungeon layout",
      5,
      "project-beta",
    );

    expect(betaResults).toHaveLength(1);
    expect(betaResults[0].data).toEqual({ secret: "beta-only" });
    expect(betaResults.some((m) => m.data.secret === "alpha-only")).toBe(false);
  });

  it("does not let a projectless search resolve a project-owned document, or vice versa", () => {
    const retriever = new SemanticRetriever();

    retriever.index(
      "world-intelligence",
      "shared query text",
      { secret: "project-owned" },
      "project-alpha",
    );
    retriever.index(
      "world-intelligence",
      "shared query text",
      { secret: "projectless" },
      undefined,
    );

    const projectlessResults = retriever.search(
      "world-intelligence",
      "shared query text",
      5,
      undefined,
    );
    expect(projectlessResults).toHaveLength(1);
    expect(projectlessResults[0].data).toEqual({ secret: "projectless" });

    const scopedResults = retriever.search(
      "world-intelligence",
      "shared query text",
      5,
      "project-alpha",
    );
    expect(scopedResults).toHaveLength(1);
    expect(scopedResults[0].data).toEqual({ secret: "project-owned" });
  });

  it("same document key (agentId) reused across two projects does not collide", () => {
    const retriever = new SemanticRetriever();
    retriever.index("planner", "quest text", { v: "A" }, "proj-A");
    retriever.index("planner", "quest text", { v: "B" }, "proj-B");

    expect(
      retriever
        .search("planner", "quest text", 10, "proj-A")
        .map((m) => m.data.v),
    ).toEqual(["A"]);
    expect(
      retriever
        .search("planner", "quest text", 10, "proj-B")
        .map((m) => m.data.v),
    ).toEqual(["B"]);
  });
});
