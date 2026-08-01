import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/distributed.ts"),
  "utf8",
);

describe("SECURITY-2G-E distributed authorization scope", () => {
  it("requires project access before project-bound job operations", () => {
    expect(source).toContain("type ProjectAccessControl");
    expect(source).toContain("access.requireProjectAccess(req, res, projectId)");
    expect(source).toContain("job.projectId");
    expect(source).toContain("filterAuthorizedDeadLetters");
  });

  it("guards cluster administration with an explicit operator allowlist", () => {
    expect(source).toContain("DISTRIBUTED_OPERATOR_USER_IDS");
    expect(source).toContain("requireDistributedOperator");
    expect(source).toContain("router.get(\"/cluster\", requireDistributedOperator");
    expect(source).toContain("router.post(\"/scale\", requireDistributedOperator");
  });

  it("authorizes retry before mutating the dead-letter queue", () => {
    const route = source.indexOf('router.post("/retry/:id"');
    const access = source.indexOf("access.requireProjectAccess", route);
    const mutation = source.indexOf("retryDeadLetter", route);
    expect(route).toBeGreaterThanOrEqual(0);
    expect(access).toBeGreaterThan(route);
    expect(mutation).toBeGreaterThan(access);
  });
});
