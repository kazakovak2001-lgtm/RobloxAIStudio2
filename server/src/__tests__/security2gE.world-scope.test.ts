import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/world.ts"),
  "utf8",
);
const indexSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/index.ts"),
  "utf8",
);

describe("SECURITY-2G-E world scope", () => {
  it("requires project access before world simulation work", () => {
    expect(routeSource).toContain(
      "export function createWorldRouter(access: ProjectAccessControl): Router",
    );
    expect(routeSource).toContain(
      "if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;",
    );
    expect(routeSource.indexOf("requireProjectAccess")).toBeLessThan(
      routeSource.indexOf("world.initialize"),
    );
    expect(indexSource).toContain(
      'app.use("/api/world", createWorldRouter(access));',
    );
  });

  it("keeps tick and stored-state routes as explicit placeholders", () => {
    expect(routeSource).toContain('router.post("/tick"');
    expect(routeSource).toContain('router.get("/state/:gameId"');
    expect(routeSource).toContain('router.get("/emergence/:gameId"');
    expect(routeSource).toContain("Single-tick mode");
    expect(routeSource).toContain("World state stored in Memory v0.6");
    expect(routeSource).toContain("Emergence data stored in Memory v0.6");
  });
});
