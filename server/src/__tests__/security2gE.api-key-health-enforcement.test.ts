import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import fs from "node:fs";
import { requireApiKeyCapability } from "../common/middleware/security";

function responseMock(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("SECURITY-2G-E API key health capability enforcement", () => {
  it("preserves user-session access when no API key principal is attached", () => {
    const res = responseMock();
    expect(
      requireApiKeyCapability(
        {} as Request,
        res,
        "system.health.database.read",
        "system-operational-metadata",
      ),
    ).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("denies an unscoped API key principal", () => {
    const req = {
      apiKeyPrincipal: {
        type: "api-key",
        keyId: "legacy-key",
        capabilities: [],
        resourceScopes: [],
      },
    } as unknown as Request;
    const res = responseMock();

    expect(
      requireApiKeyCapability(
        req,
        res,
        "system.health.database.read",
        "system-operational-metadata",
      ),
    ).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("requires both the exact capability and resource scope", () => {
    const res = responseMock();
    const basePrincipal = {
      type: "api-key" as const,
      keyId: "health-key",
      capabilities: ["system.health.database.read"],
      resourceScopes: ["system-operational-metadata"],
    };

    expect(
      requireApiKeyCapability(
        { apiKeyPrincipal: basePrincipal } as unknown as Request,
        res,
        "system.health.database.read",
        "system-operational-metadata",
      ),
    ).toBe(true);

    expect(
      requireApiKeyCapability(
        {
          apiKeyPrincipal: {
            ...basePrincipal,
            resourceScopes: ["different-scope"],
          },
        } as unknown as Request,
        responseMock(),
        "system.health.database.read",
        "system-operational-metadata",
      ),
    ).toBe(false);
  });

  it("guards both health handlers before reading operational state", () => {
    const source = fs.readFileSync("server/src/index.ts", "utf8");
    const database = source.slice(source.indexOf('app.get("/health/database"'));
    const storage = source.slice(source.indexOf('app.get("/health/storage"'));

    expect(database).toContain('"system.health.database.read"');
    expect(database).toContain('"system-operational-metadata"');
    expect(database.indexOf("requireApiKeyCapability")).toBeLessThan(
      database.indexOf("DatabaseHealthCheck"),
    );

    expect(storage).toContain('"system.health.storage.read"');
    expect(storage).toContain('"system-operational-metadata"');
    expect(storage.indexOf("requireApiKeyCapability")).toBeLessThan(
      storage.indexOf("getOperationalStatus"),
    );
  });
});
