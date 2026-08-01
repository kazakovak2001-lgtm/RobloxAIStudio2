import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "server/src/routes/knowledge.ts"),
  "utf8",
);
const index = fs.readFileSync(path.join(root, "server/src/index.ts"), "utf8");
const matrix = JSON.parse(
  fs.readFileSync(
    path.join(root, "config/security/authorization-matrix.json"),
    "utf8",
  ),
) as {
  operations: Array<{
    source: string;
    operation: string;
    classification: string;
    principal: string;
    capability: string;
    resourceScope: string;
  }>;
};

describe("SECURITY-2G-E knowledge scope", () => {
  it("guards learning writes before the knowledge engine mutates state", () => {
    expect(route).toContain("access: ProjectAccessControl");
    expect(route).toContain(
      "await access.requireProjectAccess(req, res, record.projectId)",
    );
    expect(
      route.indexOf("requireProjectAccess(req, res, record.projectId)"),
    ).toBeLessThan(route.indexOf("engine.learn(record)"));
    expect(index).toContain('createKnowledgeRouter(access)');
  });

  it("classifies all five knowledge operations", () => {
    const operations = matrix.operations.filter(
      (item) => item.source === "server/src/routes/knowledge.ts",
    );
    expect(operations).toHaveLength(5);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "GET /patterns",
          classification: "authenticated",
          principal: "user-session-or-api-key",
          capability: "system.knowledge.patterns.read",
          resourceScope: "knowledge-pattern-registry",
        }),
        expect.objectContaining({
          operation: "GET /prompts",
          classification: "authenticated",
          capability: "system.knowledge.prompts.read",
          resourceScope: "knowledge-prompt-registry",
        }),
        expect.objectContaining({
          operation: "GET /search",
          classification: "authenticated",
          capability: "system.knowledge.search",
          resourceScope: "knowledge-runtime",
        }),
        expect.objectContaining({
          operation: "GET /recommend",
          classification: "authenticated",
          capability: "system.knowledge.recommendations.read",
          resourceScope: "knowledge-runtime",
        }),
        expect.objectContaining({
          operation: "POST /store",
          classification: "project-owner",
          principal: "user-session",
          capability: "project.knowledge.record.store",
          resourceScope: "body-project",
        }),
      ]),
    );
  });
});
