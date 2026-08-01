import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/compile.ts"),
  "utf8",
);
const indexSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/index.ts"),
  "utf8",
);

describe("SECURITY-2G-E compile scope", () => {
  it("requires project ownership before starting the compile pipeline", () => {
    expect(routeSource).toContain("createCompileRouter(");
    expect(routeSource).toContain("access: ProjectAccessControl");
    expect(routeSource).toContain('error: "projectId is required"');
    expect(routeSource).toContain(
      "await access.requireProjectAccess(req, res, projectId)",
    );

    const guard = routeSource.indexOf(
      "await access.requireProjectAccess(req, res, projectId)",
    );
    const planner = routeSource.indexOf("const planner = new PlannerEngine()");
    const agentExecution = routeSource.indexOf("agentRegistry.executeAgent");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(planner);
    expect(guard).toBeLessThan(agentExecution);
  });

  it("wires the shared project access control into the compile router", () => {
    expect(indexSource).toContain("createCompileRouter(agentRegistry, access)");
  });
});
