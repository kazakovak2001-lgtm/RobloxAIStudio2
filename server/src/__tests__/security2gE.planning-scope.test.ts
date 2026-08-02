import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/planning.ts"),
  "utf8",
);
const indexSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/index.ts"),
  "utf8",
);

describe("SECURITY-2G-E planning scope", () => {
  it("requires project access before creating plans", () => {
    expect(routeSource).toContain("projectId is required");
    expect(routeSource).toContain(
      "await access.requireProjectAccess(req, res, projectId)",
    );
    expect(
      routeSource.indexOf(
        "await access.requireProjectAccess(req, res, projectId)",
      ),
    ).toBeLessThan(routeSource.indexOf("planner.createPlan(goal)"));
  });

  it("resolves stored plan project ownership before execute and read", () => {
    expect(routeSource).toContain("requirePlanProjectAccess");
    expect(routeSource).toContain("plan.goal.projectId");
    expect(routeSource).toContain('error: "Plan not found"');
    expect(
      routeSource.indexOf("requirePlanProjectAccess(req, res, plan)"),
    ).toBeLessThan(routeSource.indexOf("executor.executePlan("));
  });

  it("wires the shared project access control into the planning router", () => {
    expect(indexSource).toContain(
      "createPlanningRouter(agentRegistry, access)",
    );
  });
});
