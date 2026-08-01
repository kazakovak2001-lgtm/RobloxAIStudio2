import { describe, expect, it } from "vitest";
import fs from "node:fs";

const store = fs.readFileSync(
  "server/src/platform/security/ApiKeyStore.ts",
  "utf8",
);
const security = fs.readFileSync(
  "server/src/common/middleware/security.ts",
  "utf8",
);

describe("SECURITY-2G-E API key principal propagation", () => {
  it("stores explicit capability and resource scopes", () => {
    expect(store).toContain("capabilities?: string[]");
    expect(store).toContain("resourceScopes?: string[]");
    expect(store).toContain(
      "capabilities: normalizeScopeValues(metadata.capabilities)",
    );
    expect(store).toContain(
      "resourceScopes: normalizeScopeValues(metadata.resourceScopes)",
    );
  });

  it("resolves a typed API key principal without inventing user identity", () => {
    expect(store).toContain("resolvePrincipal(rawKey: unknown): ApiKeyPrincipal | null");
    expect(store).toContain('type: "api-key"');
    expect(store).toContain("keyId: record.id");
    expect(store).toContain("capabilities: normalizeScopeValues(record.capabilities)");
    expect(store).toContain("resourceScopes: normalizeScopeValues(record.resourceScopes)");
    expect(store).not.toContain("userId: record.ownerId");
  });

  it("keeps legacy unscoped keys fail-closed for authorization", () => {
    expect(store).toContain("function normalizeScopeValues");
    expect(store).toContain("values ?? []");
    expect(store).not.toContain('capabilities: ["*"]');
    expect(store).not.toContain('resourceScopes: ["*"]');
  });

  it("attaches the resolved principal to the request", () => {
    expect(security).toContain("ApiKeyAuthenticatedRequest");
    expect(security).toContain("getRequestApiKeyPrincipal");
    expect(security).toContain("getApiKeyStore().resolvePrincipal(apiKey)");
    expect(security).toContain(
      "(req as ApiKeyAuthenticatedRequest).apiKeyPrincipal = apiKeyPrincipal",
    );
    expect(security).not.toContain(
      "if (apiKey && getApiKeyStore().validate(apiKey))",
    );
  });
});
