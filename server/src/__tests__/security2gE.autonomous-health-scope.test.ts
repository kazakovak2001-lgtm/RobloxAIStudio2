import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const autonomous = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/autonomous.ts"),
  "utf8",
);
const security = fs.readFileSync(
  path.join(process.cwd(), "server/src/common/middleware/security.ts"),
  "utf8",
);
const index = fs.readFileSync(
  path.join(process.cwd(), "server/src/index.ts"),
  "utf8",
);

describe("SECURITY-2G-E autonomous latest and health scope", () => {
  it("authorizes the latest autonomous session by path project before reading it", () => {
    const route = autonomous.indexOf('router.get("/project/:projectId/latest"');
    const access = autonomous.indexOf(
      "access.requireProjectAccess(req, res, req.params.projectId)",
      route,
    );
    const read = autonomous.indexOf("getLatestSessionForProject", route);
    expect(route).toBeGreaterThanOrEqual(0);
    expect(access).toBeGreaterThan(route);
    expect(read).toBeGreaterThan(access);
  });

  it("keeps only the exact root health path public", () => {
    expect(security).toContain("const PUBLIC_PATHS = [");
    expect(security).toContain('"/health"');
    expect(security).not.toContain('"/health/database"');
    expect(security).not.toContain('"/health/storage"');
  });

  it("exposes database and storage health as read-only operational metadata", () => {
    expect(index).toContain('app.get("/health/database"');
    expect(index).toContain('app.get("/health/storage"');
    expect(index).toContain("getOperationalStatus()");
  });
});
