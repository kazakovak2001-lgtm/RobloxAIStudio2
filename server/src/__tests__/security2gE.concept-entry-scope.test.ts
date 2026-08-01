import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const route = readFileSync(
  resolve(root, "server/src/routes/concept.ts"),
  "utf8",
);
const generator = readFileSync(
  resolve(root, "scripts/generate-authorization-matrix.ts"),
  "utf8",
);

function handlerSlice(start: string, end: string): string {
  const startIndex = route.indexOf(start);
  const endIndex = route.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return route.slice(startIndex, endIndex);
}

describe("SECURITY-2G-E concept entry scope", () => {
  it("binds generated concepts to the authenticated user session", () => {
    const generate = handlerSlice(
      'router.post("/generate"',
      "// GET /api/concept/:id",
    );
    expect(generate).toContain("access.requireAuthenticatedUser(req, res)");
    expect(generate).toContain("conceptOwners.set(conceptId, userId)");
    expect(
      generate.indexOf("access.requireAuthenticatedUser(req, res)"),
    ).toBeLessThan(generate.indexOf("concepts.set(conceptId, concept)"));
  });

  it("conceals foreign concept reads and pipeline execution", () => {
    const read = handlerSlice(
      'router.get("/:id"',
      "// POST /api/experience/generate",
    );
    const experience = handlerSlice(
      'router.post("/experience/generate"',
      "// GET /api/concept/experience/status",
    );
    for (const slice of [read, experience]) {
      expect(slice).toContain("conceptOwners.get");
      expect(slice).toContain("access.requireAuthenticatedUser(req, res)");
      expect(slice).toContain('error: "Concept not found"');
    }
    expect(experience.indexOf("conceptOwners.get")).toBeLessThan(
      experience.indexOf("pipelineEngine.run"),
    );
  });

  it("guards direct generation before pipeline and history side effects", () => {
    const direct = handlerSlice(
      'router.post("/experience/generate-direct"',
      "// GET /api/concept/experience/:pipelineId/metrics",
    );
    const guard = direct.indexOf(
      "access.requireProjectAccess(req, res, projectId)",
    );
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(direct.indexOf("pipelineEngine.startAsync"));
    expect(guard).toBeLessThan(direct.indexOf("generationHistory.record"));
  });

  it("classifies all four remaining concept entry operations", () => {
    expect(generator).toContain("user.concept.create");
    expect(generator).toContain("user.concept.read");
    expect(generator).toContain("user.concept.pipeline.generate");
    expect(generator).toContain("project.concept.pipeline.generate-direct");
    expect(generator).toContain("security2gE.concept-entry-scope.test.ts");
  });
});
