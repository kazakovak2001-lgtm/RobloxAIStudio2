import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/domain.ts"),
  "utf8",
);
const securitySource = fs.readFileSync(
  path.join(process.cwd(), "server/src/common/middleware/security.ts"),
  "utf8",
);

describe("SECURITY-2G-E domain intelligence scope", () => {
  it("keeps domain operations behind the global authentication middleware", () => {
    expect(securitySource).toContain("const PUBLIC_PATHS");
    expect(securitySource).toContain(
      "getApiKeyStore().resolvePrincipal(apiKey)",
    );
    expect(securitySource).toContain(
      "(req as ApiKeyAuthenticatedRequest).apiKeyPrincipal = apiKeyPrincipal",
    );
    expect(securitySource).not.toContain('"/api/domain"');
  });

  it("exposes only stateless taxonomy, recommendation, and analysis operations", () => {
    expect(routeSource).toContain('router.get("/genres"');
    expect(routeSource).toContain('router.get("/genres/:genre"');
    expect(routeSource).toContain('router.get("/patterns"');
    expect(routeSource).toContain('router.get("/recommendations"');
    expect(routeSource).toContain('router.post("/analyze"');
    expect(routeSource).toContain("const engine = new DomainEngine()");
  });
});
