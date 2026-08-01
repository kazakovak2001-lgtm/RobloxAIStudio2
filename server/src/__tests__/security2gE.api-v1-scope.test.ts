import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/api/v1/index.ts"),
  "utf8",
);
const bootstrap = fs.readFileSync(
  path.join(process.cwd(), "server/src/index.ts"),
  "utf8",
);

describe("SECURITY-2G-E API v1 authorization scope", () => {
  it("requires project access before compile and plan creation", () => {
    expect(source).toContain('import type { ProjectAccessControl } from "../../routes/projects"');
    expect(source).toContain("access.requireProjectAccess(req, res, projectId)");
    expect(source).toContain("projectId is required");
  });

  it("resolves stored plan ownership before read or execution", () => {
    expect(source).toContain("requirePlanProjectAccess");
    expect(source).toContain("plan.goal.projectId");
    expect(source).toContain('router.post("/plan/execute", async');
    expect(source).toContain('router.get("/plan/:id", async');
  });

  it("passes the shared access contract from the production bootstrap", () => {
    expect(bootstrap).toContain("createV1Router(agentRegistry, gateway, access)");
  });
});
