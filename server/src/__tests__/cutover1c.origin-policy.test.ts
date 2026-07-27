import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import {
  corsMiddleware,
  getAllowedFrontendOrigins,
  isFrontendOriginAllowed,
} from "../common/middleware/security";

describe("CUTOVER-1C shared frontend origin policy", () => {
  let originalNodeEnv: string | undefined;
  let originalFrontendUrl: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalFrontendUrl = process.env.FRONTEND_URL;
  });

  afterEach(() => {
    restoreEnvironment("NODE_ENV", originalNodeEnv);
    restoreEnvironment("FRONTEND_URL", originalFrontendUrl);
  });

  it("normalizes the configured production URL to one browser origin", () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://app.example.test:8443/some/path";

    expect(getAllowedFrontendOrigins()).toEqual([
      "https://app.example.test:8443",
    ]);
    expect(isFrontendOriginAllowed("https://app.example.test:8443")).toBe(true);
    expect(isFrontendOriginAllowed("http://localhost:5173")).toBe(false);
  });

  it("fails closed when the production frontend URL is absent or invalid", () => {
    process.env.NODE_ENV = "production";
    delete process.env.FRONTEND_URL;
    expect(getAllowedFrontendOrigins()).toEqual([]);

    process.env.FRONTEND_URL = "not a valid origin";
    expect(getAllowedFrontendOrigins()).toEqual([]);
    expect(isFrontendOriginAllowed("https://app.example.test")).toBe(false);
  });

  it("allows the configured origin with credentials and rejects another origin", () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://localhost:8443";

    const allowed = runCors("https://localhost:8443", "OPTIONS");
    expect(allowed.status).toBe(204);
    expect(allowed.headers["Access-Control-Allow-Origin"]).toBe(
      "https://localhost:8443",
    );
    expect(allowed.headers["Access-Control-Allow-Credentials"]).toBe("true");

    const rejected = runCors("https://not-allowed.example", "GET");
    expect(rejected.status).toBe(403);
    expect(rejected.body).toEqual({
      success: false,
      error: "Origin not allowed",
    });
    expect(rejected.nextCalled).toBe(false);
  });

  it("preserves permissive development origins", () => {
    process.env.NODE_ENV = "development";
    delete process.env.FRONTEND_URL;

    expect(isFrontendOriginAllowed("http://localhost:5173")).toBe(true);
    const result = runCors("http://localhost:5173", "GET");
    expect(result.nextCalled).toBe(true);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe(
      "http://localhost:5173",
    );
  });
});

function runCors(origin: string, method: string) {
  const headers: Record<string, string> = {};
  let status = 200;
  let body: unknown;
  let nextCalled = false;

  const request = {
    headers: { origin },
    method,
  } as Request;
  const response = {
    header(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    sendStatus(code: number) {
      status = code;
      return this;
    },
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;

  corsMiddleware(request, response, () => {
    nextCalled = true;
  });

  return { headers, status, body, nextCalled };
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
