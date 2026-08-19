import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "server/src/routes/simulation.ts"),
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
    capability: string;
  }>;
};

describe("SECURITY-2G-E simulation authorization scope", () => {
  it("guards project simulations and concealed stored metrics", () => {
    expect(route).toContain(
      "export function createSimulationRouter(access: ProjectAccessControl)",
    );
    // AUDIT-BODY-SUPPLIED-BLUEPRINT-001: the body-supplied blueprint.id is
    // authorized through the one canonical helper, not an inline call.
    expect(route).toContain(
      "await requireProjectAccessForBlueprint(access, req, res, blueprint)",
    );
    expect(route).toContain("await access.hasProjectAccess(req, gameId)");
    expect(route).toContain('error: "No simulation data"');
    expect(index).toContain(
      'app.use("/api/simulate", createSimulationRouter(access));',
    );
  });

  it("classifies all four simulation operations", () => {
    const operations = matrix.operations.filter(
      (entry) => entry.source === "server/src/routes/simulation.ts",
    );
    expect(operations).toHaveLength(4);
    expect(
      operations.filter((entry) => entry.classification === "project-owner"),
    ).toHaveLength(3);
    expect(
      operations.find((entry) => entry.operation === "POST /feedback"),
    ).toMatchObject({
      classification: "authenticated",
      capability: "system.simulation.feedback.analyze",
    });
  });
});
