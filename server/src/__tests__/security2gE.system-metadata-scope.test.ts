import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/system.ts"),
  "utf8",
);
const securitySource = fs.readFileSync(
  path.join(process.cwd(), "server/src/common/middleware/security.ts"),
  "utf8",
);

describe("SECURITY-2G-E system metadata scope", () => {
  it("keeps system metadata behind global authentication", () => {
    expect(securitySource).toContain("getApiKeyStore().validate(apiKey)");
    expect(securitySource).not.toContain('"/api/system"');
  });

  it("exposes only read-only platform registry metadata", () => {
    expect(routeSource).toContain('router.get("/status"');
    expect(routeSource).toContain('router.get("/agents"');
    expect(routeSource).toContain('router.get("/agents/:id"');
    expect(routeSource).not.toMatch(/router\.(post|put|patch|delete)\(/);
    expect(routeSource).toContain("getGovernanceAgentRegistry()");
    expect(routeSource).toContain("createDefaultPromptEngine()");
  });
});
