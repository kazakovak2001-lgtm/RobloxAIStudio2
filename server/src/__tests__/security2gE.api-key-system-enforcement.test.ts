import { describe, expect, it } from "vitest";
import fs from "node:fs";

const security = fs.readFileSync(
  "server/src/common/middleware/security.ts",
  "utf8",
);
const systemRoute = fs.readFileSync("server/src/routes/system.ts", "utf8");

describe("SECURITY-2G-E API key system enforcement", () => {
  it("removes system metadata endpoints from the public auth bypass", () => {
    const publicPaths = security.slice(
      security.indexOf("const PUBLIC_PATHS"),
      security.indexOf("const PUBLIC_PREFIXES"),
    );
    expect(publicPaths).not.toContain('"/api/system/status"');
    expect(publicPaths).not.toContain('"/api/system/agents"');
  });

  it("enforces the status capability before reading platform runtime metadata", () => {
    const handler = systemRoute.slice(systemRoute.indexOf('router.get("/status"'));
    expect(handler).toContain('"system.platform.status.read"');
    expect(handler).toContain('"platform-runtime-metadata"');
    expect(handler.indexOf("requireApiKeyCapability")).toBeLessThan(
      handler.indexOf("getGovernanceAgentRegistry"),
    );
  });

  it("enforces list and detail capabilities before reading the agent registry", () => {
    const listHandler = systemRoute.slice(
      systemRoute.indexOf('router.get("/agents"'),
      systemRoute.indexOf('router.get("/agents/:id"'),
    );
    expect(listHandler).toContain('"system.platform.agents.list"');
    expect(listHandler).toContain('"governance-agent-registry"');
    expect(listHandler.indexOf("requireApiKeyCapability")).toBeLessThan(
      listHandler.indexOf("getGovernanceAgentRegistry"),
    );

    const detailHandler = systemRoute.slice(
      systemRoute.indexOf('router.get("/agents/:id"'),
    );
    expect(detailHandler).toContain('"system.platform.agent.read"');
    expect(detailHandler).toContain('"governance-agent-registry"');
    expect(detailHandler.indexOf("requireApiKeyCapability")).toBeLessThan(
      detailHandler.indexOf("getGovernanceAgentRegistry"),
    );
  });
});
