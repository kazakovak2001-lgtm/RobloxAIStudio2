import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/lifecycle.ts"),
  "utf8",
);
const indexSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/index.ts"),
  "utf8",
);

describe("SECURITY-2G-E lifecycle project scope", () => {
  it("requires project access before lifecycle mutations and reads", () => {
    expect(routeSource).toContain(
      "export function createLifecycleRouter(access: ProjectAccessControl): Router",
    );
    expect(routeSource.match(/access\.requireProjectAccess\(/g)).toHaveLength(
      3,
    );
    // AUDIT-BODY-SUPPLIED-BLUEPRINT-001: /patch has no gameId to cross-check
    // against, so it authorizes blueprint.id through the same canonical
    // helper the other body-only-blueprint routes use.
    expect(routeSource).toContain(
      "await requireProjectAccessForBlueprint(access, req, res, blueprint)",
    );
    expect(routeSource).toContain("blueprint.id !== gameId");
    expect(routeSource).toContain('error: "blueprint.id must match gameId"');
    expect(indexSource).toContain(
      'app.use("/api/lifecycle", createLifecycleRouter(access));',
    );
  });

  it("guards before lifecycle engines mutate state", () => {
    expect(routeSource.indexOf("access.requireProjectAccess")).toBeLessThan(
      routeSource.indexOf("controller.start(gameId)"),
    );
    expect(routeSource.indexOf("access.requireProjectAccess")).toBeLessThan(
      routeSource.indexOf("controller.tick(gameId)"),
    );
  });
});
