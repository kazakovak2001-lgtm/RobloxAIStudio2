import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/analytics.ts"),
  "utf8",
);

describe("SECURITY-2G-E analytics operator boundary", () => {
  it("installs one router-wide analytics operator guard before all routes", () => {
    const guard = source.indexOf("router.use(requireAnalyticsOperator);");
    const firstRoute = source.indexOf('router.get("/system"');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(firstRoute).toBeGreaterThan(guard);
  });

  it("requires an explicit production analytics allowlist", () => {
    expect(source).toContain("ANALYTICS_OPERATOR_USER_IDS");
    expect(source).toContain("user?.userId");
    expect(source).toContain("Analytics operator access required");
  });

  it("does not grant analytics operator access to API-key-only requests", () => {
    expect(source).not.toContain('req.headers["x-api-key"]');
    expect(source).not.toContain("req.headers['x-api-key']");
  });
});
