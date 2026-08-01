import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/agentCollaboration.ts"),
  "utf8",
);

describe("SECURITY-2G-E agent collaboration authorization scope", () => {
  it("requires project access before starting a collaborative session", () => {
    const route = source.indexOf('router.post("/run"');
    const guard = source.indexOf(
      "access.requireProjectAccess(req, res, projectId)",
      route,
    );
    const mutation = source.indexOf("coordinator.runCollaborativeSession", route);
    expect(source).toContain('import type { ProjectAccessControl } from "./projects"');
    expect(route).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(route);
    expect(mutation).toBeGreaterThan(guard);
  });

  it("guards global collaboration reads with an explicit operator allowlist", () => {
    expect(source).toContain("COLLABORATION_OPERATOR_USER_IDS");
    expect(source).toContain("requireCollaborationOperator");
    for (const route of ["/status", "/messages", "/metrics", "/consensus"]) {
      expect(source).toContain(`router.get("${route}", requireCollaborationOperator`);
    }
  });

  it("keeps development compatibility while failing closed in production", () => {
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).toContain("Collaboration operator access required");
    expect(source).toContain("operatorIds.has(userId)");
  });
});
