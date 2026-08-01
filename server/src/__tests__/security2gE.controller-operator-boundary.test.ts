import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/controller.ts"),
  "utf8",
);

describe("SECURITY-2G-E controller operator boundary", () => {
  it("installs one router-wide operator guard before controller routes", () => {
    const guard = source.indexOf("router.use(requireControllerOperator);");
    const firstRoute = source.indexOf('router.get("/health"');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(firstRoute).toBeGreaterThan(guard);
  });

  it("requires an explicit production operator allowlist", () => {
    expect(source).toContain("CONTROLLER_OPERATOR_USER_IDS");
    expect(source).toContain(".user?.userId");
    expect(source).toContain("operatorIds.has(userId)");
    expect(source).toContain("Controller operator access required");
  });

  it("does not treat API-key-only authentication as an operator principal", () => {
    expect(source).not.toContain('req.headers["x-api-key"]');
    expect(source).not.toContain("req.headers['x-api-key']");
  });
});
