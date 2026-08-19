import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { corsMiddleware } from "../common/middleware/security";

describe("MAR-004 browser CORS contract", () => {
  it("allows Idempotency-Key on a trusted production preflight", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://frontend.example.test";

    const headers = new Map<string, string>();
    const sendStatus = vi.fn();
    const next = vi.fn() as unknown as NextFunction;
    const req = {
      method: "OPTIONS",
      headers: { origin: "https://frontend.example.test" },
    } as unknown as Request;
    const res = {
      header(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
        return this;
      },
      sendStatus,
    } as unknown as Response;

    try {
      corsMiddleware(req, res, next);

      expect(sendStatus).toHaveBeenCalledWith(204);
      expect(next).not.toHaveBeenCalled();
      expect(headers.get("access-control-allow-origin")).toBe(
        "https://frontend.example.test",
      );
      expect(headers.get("access-control-allow-credentials")).toBe("true");
      expect(
        headers
          .get("access-control-allow-headers")
          ?.split(",")
          .map((header) => header.trim().toLowerCase()),
      ).toContain("idempotency-key");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });
});
