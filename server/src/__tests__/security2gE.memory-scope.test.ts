import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/memory.ts"),
  "utf8",
);
const indexSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/index.ts"),
  "utf8",
);

describe("SECURITY-2G-E memory scope", () => {
  it("requires project ownership before project memory reads, writes, and search", () => {
    expect(routeSource).toContain("createMemoryRouter(access: ProjectAccessControl)");
    expect(routeSource).toContain("projectId query parameter required");
    expect(routeSource).toContain("projectId required");
    expect(routeSource.match(/access\.requireProjectAccess/g)?.length).toBe(3);
    expect(indexSource).toContain('createMemoryRouter(access)');
  });

  it("guards global memory stats with a user-session operator allowlist", () => {
    expect(routeSource).toContain("MEMORY_OPERATOR_USER_IDS");
    expect(routeSource).toContain("Memory operator access required");
    expect(routeSource).toContain(
      'router.get("/system/stats", requireMemoryOperator',
    );
  });
});
