import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "server/src/routes/platform.ts"),
  "utf8",
);
const matrix = JSON.parse(
  fs.readFileSync(
    path.join(root, "config/security/authorization-matrix.json"),
    "utf8",
  ),
) as {
  operations: Array<{
    source: string;
    operation: string;
    classification: string;
    principal: string;
    capability: string;
    resourceScope: string;
  }>;
};

describe("SECURITY-2G-E platform remaining scope", () => {
  it("guards durable user creation with a platform operator boundary", () => {
    expect(route).toContain("PLATFORM_OPERATOR_USER_IDS");
    expect(route).toContain("requirePlatformOperator");
    expect(route.indexOf("requirePlatformOperator(req, res)")).toBeLessThan(
      route.indexOf("users.createDurable"),
    );
    expect(route).toContain('error: "Platform operator access required"');
  });

  it("classifies platform user creation and registry metadata", () => {
    const operations = matrix.operations.filter(
      (item) =>
        item.source === "server/src/routes/platform.ts" &&
        [
          "POST /users",
          "GET /registry/agents",
          "GET /registry/agents/:id",
        ].includes(item.operation),
    );
    expect(operations).toHaveLength(3);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "POST /users",
          classification: "platform-operator",
          principal: "user-session",
          capability: "system.platform.users.create",
          resourceScope: "global-user-directory",
        }),
        expect.objectContaining({
          operation: "GET /registry/agents",
          classification: "authenticated",
          principal: "user-session-or-api-key",
          capability: "system.platform.registry.agents.list",
          resourceScope: "platform-agent-registry",
        }),
        expect.objectContaining({
          operation: "GET /registry/agents/:id",
          classification: "authenticated",
          principal: "user-session-or-api-key",
          capability: "system.platform.registry.agent.read",
          resourceScope: "platform-agent-registry",
        }),
      ]),
    );
  });
});
