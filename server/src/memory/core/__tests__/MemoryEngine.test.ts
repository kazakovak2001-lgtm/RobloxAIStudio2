import { describe, it, expect } from "vitest";
import { MemoryEngine } from "../MemoryEngine";

describe("MemoryEngine project isolation", () => {
  it("project A cannot read project B memory via semantic search, even with a shared agentId", async () => {
    const engine = new MemoryEngine();

    await engine.storeMemory({
      agentId: "world-intelligence",
      projectId: "project-A",
      input: { theme: "castle" },
      output: { plan: "castle siege layout with hidden traps" },
      timestamp: new Date(),
    });
    await engine.storeMemory({
      agentId: "world-intelligence",
      projectId: "project-B",
      input: { theme: "castle" },
      output: { plan: "castle siege layout with hidden traps" },
      timestamp: new Date(),
    });

    const resultForB = await engine.retrieveMemory(
      "world-intelligence",
      "castle siege layout",
      "project-B",
    );

    // Every LTM entry and every semantic match returned to project B must
    // belong to project B.
    for (const entry of resultForB.entries) {
      expect(entry.projectId).toBe("project-B");
    }
    expect(resultForB.entries.length).toBeGreaterThan(0);
    expect(resultForB.semanticMatches.length).toBeGreaterThan(0);
  });

  it("project A cannot overwrite/collide project B memory when both use identical agentId + content", async () => {
    const engine = new MemoryEngine();

    await engine.storeMemory({
      agentId: "economy-balance",
      projectId: "project-A",
      input: {},
      output: { balance: "A-specific-secret-value" },
      timestamp: new Date(),
    });
    await engine.storeMemory({
      agentId: "economy-balance",
      projectId: "project-B",
      input: {},
      output: { balance: "B-specific-secret-value" },
      timestamp: new Date(),
    });

    const resultForA = await engine.retrieveMemory(
      "economy-balance",
      "A-specific-secret-value",
      "project-A",
    );

    const leaked = resultForA.semanticMatches.some(
      (m) =>
        (m.data as { balance?: string }).balance === "B-specific-secret-value",
    );
    expect(leaked).toBe(false);
  });

  it("same identifier (agentId) reused across two projects does not collide in the merged context", async () => {
    const engine = new MemoryEngine();

    await engine.storeMemory({
      agentId: "lifecycle-feedback",
      projectId: "project-X",
      input: {},
      output: { note: "project-X-only" },
      timestamp: new Date(),
    });
    await engine.storeMemory({
      agentId: "lifecycle-feedback",
      projectId: "project-Y",
      input: {},
      output: { note: "project-Y-only" },
      timestamp: new Date(),
    });

    const resultForY = await engine.retrieveMemory(
      "lifecycle-feedback",
      "note",
      "project-Y",
    );

    expect(resultForY.merged).toEqual({ note: "project-Y-only" });
  });
});
