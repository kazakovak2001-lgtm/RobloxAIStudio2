import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/projects.ts"),
  "utf8",
);

function handler(operation: string): string {
  const start = source.indexOf(operation);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\n  router.", start + operation.length);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("SECURITY-2G-E project route authorization", () => {
  it("scopes project listing and creation to the authenticated user", () => {
    for (const registration of [
      'router.get("/", async (req, res) => {',
      'router.post("/", async (req, res) => {',
    ]) {
      const body = handler(registration);
      expect(body).toContain("access.requireAuthenticatedUser(req, res)");
      expect(body.indexOf("access.requireAuthenticatedUser(req, res)")).toBeLessThan(
        body.indexOf("res.json("),
      );
    }
    expect(handler('router.get("/", async (req, res) => {')).toContain(
      "projects.getByOwner(userId)",
    );
    const createBody = handler('router.post("/", async (req, res) => {');
    expect(createBody).toContain("projects.createDurable(");
    expect(createBody.indexOf("projects.createDurable(")).toBeLessThan(
      createBody.indexOf("res.json("),
    );
    expect(createBody).toMatch(/projects\.createDurable\(\s*userId,/);
  });

  it("guards every path-project read and mutation before success", () => {
    for (const registration of [
      'router.get("/:id", async (req, res) => {',
      'router.get("/:id/history", async (req, res) => {',
      'router.put("/:id", async (req, res) => {',
      'router.delete("/:id", async (req, res) => {',
    ]) {
      const body = handler(registration);
      expect(body).toContain(
        "access.requireProjectAccess(req, res, req.params.id)",
      );
      expect(
        body.indexOf("access.requireProjectAccess(req, res, req.params.id)"),
      ).toBeLessThan(body.indexOf("res.json("));
    }
  });
});
