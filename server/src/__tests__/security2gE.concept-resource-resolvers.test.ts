import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const conceptSource = fs.readFileSync(
  path.join(repositoryRoot, "server/src/routes/concept.ts"),
  "utf8",
);
const indexSource = fs.readFileSync(
  path.join(repositoryRoot, "server/src/index.ts"),
  "utf8",
);

function paramBlock(name: "pipelineId" | "artifactId"): string {
  const start = conceptSource.indexOf(`router.param("${name}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextParam = conceptSource.indexOf("router.param(", start + 1);
  const firstRoute = conceptSource.indexOf("router.post(", start + 1);
  const endCandidates = [nextParam, firstRoute].filter(
    (candidate) => candidate > start,
  );
  const end = Math.min(...endCandidates);
  return conceptSource.slice(start, end);
}

describe("SECURITY-2G-E concept indirect resource resolvers", () => {
  it("injects project access control into the production concept router", () => {
    expect(conceptSource).toContain("access: ProjectAccessControl");
    expect(indexSource).toContain(
      "createConceptRouter(agentRegistry, generationHistory, access)",
    );
  });

  it("resolves pipelineId to state.projectId before route handlers", () => {
    const block = paramBlock("pipelineId");
    expect(block).toContain("pipelineEngine.getState(value)");
    expect(block).toContain("state.projectId");
    expect(block).toContain("concealProjectAccess");
    expect(block).toContain('error: "Pipeline not found"');
  });

  it("resolves artifactId through artifact.pipelineId and pipeline state", () => {
    const block = paramBlock("artifactId");
    expect(block).toContain("pipelineEngine.getArtifact(value)");
    expect(block).toContain("artifact.pipelineId");
    expect(block).toContain("pipelineEngine.getState(artifact.pipelineId)");
    expect(block).toContain("state.projectId");
    expect(block).toContain("concealProjectAccess");
    expect(block).toContain('error: "Artifact not found"');
  });

  it("conceals cross-owner and missing resources with 404", () => {
    expect(conceptSource).toContain("access.hasProjectAccess");
    expect(conceptSource).toContain("res.status(404).json");
    expect(conceptSource).not.toContain("Project access denied");
  });
});
