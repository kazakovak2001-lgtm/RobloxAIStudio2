import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/debug.ts"),
  "utf8",
);

describe("SECURITY-2G-E debug operator boundary", () => {
  it("installs one router-wide operator guard before debug routes", () => {
    const guard = source.indexOf("router.use(requireDebugOperator);");
    const firstRoute = source.indexOf('router.get("/executions"');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(firstRoute).toBeGreaterThan(guard);
  });

  it("requires an explicit production operator allowlist", () => {
    expect(source).toContain("DEBUG_OPERATOR_USER_IDS");
    expect(source).toContain(".user?.userId");
    expect(source).toContain("Debug operator access required");
    expect(source).toContain("operatorIds.has(userId)");
  });

  it("does not treat API-key-only authentication as an operator principal", () => {
    expect(source).not.toContain('req.headers["x-api-key"]');
    expect(source).not.toContain("req.headers['x-api-key']");
  });
});
