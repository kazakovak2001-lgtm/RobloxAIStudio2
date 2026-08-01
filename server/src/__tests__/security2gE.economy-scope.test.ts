import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/economy.ts"),
  "utf8",
);
const indexSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/index.ts"),
  "utf8",
);

describe("SECURITY-2G-E economy scope", () => {
  it("guards blueprint-backed analysis and simulation before economy execution", () => {
    expect(routeSource).toContain("access: ProjectAccessControl");
    expect(routeSource).toContain("await access.requireProjectAccess(req, res, blueprint.id)");
    expect(routeSource.indexOf("await access.requireProjectAccess(req, res, blueprint.id)")).toBeLessThan(
      routeSource.indexOf("modelEngine.parse(blueprint)"),
    );
  });

  it("passes shared project access control from the application bootstrap", () => {
    expect(indexSource).toContain('app.use("/api/economy", createEconomyRouter(access));');
  });

  it("keeps balance request-scoped and report endpoint metadata-only", () => {
    expect(routeSource).toContain('router.post("/balance"');
    expect(routeSource).toContain('router.get("/report/:gameId"');
    expect(routeSource).toContain("placeholder for stored reports");
  });
});
