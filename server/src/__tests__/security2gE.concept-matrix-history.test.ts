import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const conceptSource = fs.readFileSync(
  path.join(repositoryRoot, "server/src/routes/concept.ts"),
  "utf8",
);
const generatorSource = fs.readFileSync(
  path.join(repositoryRoot, "scripts/generate-authorization-matrix.ts"),
  "utf8",
);

const pipelineOperations = [
  "GET /experience/status/:pipelineId",
  "POST /experience/:pipelineId/pause",
  "POST /experience/:pipelineId/resume",
  "POST /experience/:pipelineId/cancel",
  "POST /experience/:pipelineId/retry",
  "POST /experience/:pipelineId/stage/:stage/retry",
  "GET /experience/:pipelineId/artifacts",
  "GET /experience/:pipelineId/review",
  "GET /experience/:pipelineId/metrics",
  "GET /experience/:pipelineId/audit",
];

const artifactOperations = [
  "GET /experience/artifact/:artifactId",
  "POST /experience/artifact/:artifactId/approve",
  "POST /experience/artifact/:artifactId/reject",
  "POST /experience/artifact/:artifactId/comment",
  "POST /experience/artifact/:artifactId/edit",
];

describe("SECURITY-2G-E concept matrix and history", () => {
  it("tracks every pipeline and artifact operation with resolver evidence", () => {
    for (const operation of [...pipelineOperations, ...artifactOperations]) {
      expect(generatorSource).toContain(operation);
    }
    expect(generatorSource).toContain("resolved-pipeline-project");
    expect(generatorSource).toContain("resolved-artifact-project");
    expect(generatorSource).toContain(
      "security2gE.concept-resource-resolvers.test.ts",
    );
  });

  it("filters global history through project access before returning entries", () => {
    expect(conceptSource).toContain(
      'router.get("/experience/history", async (req, res) =>',
    );
    expect(conceptSource).toContain(
      "await access.hasProjectAccess(req, state.projectId)",
    );
    expect(conceptSource).toContain("visibleHistory");
    expect(conceptSource).toContain(
      "res.json({ success: true, data: visibleHistory })",
    );
  });
});
