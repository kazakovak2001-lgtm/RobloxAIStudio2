/**
 * Security Middleware — Rate limiting, CORS, auth, helmet, request logging.
 */

import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { authService } from "../../platform/auth/authServiceInstance";
import { ApiKeyStore } from "../../platform/security/ApiKeyStore";
import { createStorageProvider } from "../../platform/storage/StorageFactory";

const apiKeyStore = new ApiKeyStore(createStorageProvider());
apiKeyStore.seedFromEnvironment();

export function getApiKeyStore(): ApiKeyStore {
  return apiKeyStore;
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please try again later.",
  },
});

/** Brute-force protection for the public login endpoint. */
export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: "Too many login attempts. Please try again later.",
  },
});

// ─── Helmet ─────────────────────────────────────────────────────────────────

export const securityHeaders = helmet({
  contentSecurityPolicy: false, // Disable CSP for API server (no HTML served from backend)
  crossOriginEmbedderPolicy: false, // Allow embedding for dev
});

// ─── CORS ───────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "http://localhost:5173", // Vite dev
  "http://localhost:5174",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;
  const isDev = process.env.NODE_ENV !== "production";

  // In development, allow all origins for convenience
  if (isDev || (origin && ALLOWED_ORIGINS.includes(origin))) {
    res.header("Access-Control-Allow-Origin", origin ?? "*");
  } else if (!origin) {
    // Allow requests without origin (server-to-server, curl, Studio plugin)
    res.header("Access-Control-Allow-Origin", "*");
  } else {
    res.status(403).json({ success: false, error: "Origin not allowed" });
    return;
  }

  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, X-Studio-Session",
  );
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

// ─── Authentication ─────────────────────────────────────────────────────────

const PUBLIC_PATHS = [
  "/health",
  "/api/system/status",
  "/api/system/agents",
  "/",
];

const PUBLIC_PREFIXES = [
  "/api/platform/auth", // Auth routes (login, register, refresh, logout) must be public
];

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip auth in development mode
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  // Public routes
  if (PUBLIC_PATHS.includes(req.path)) {
    next();
    return;
  }

  // Public prefixes (login/register)
  if (
    PUBLIC_PREFIXES.some((p) => req.path.startsWith(p) && req.method === "POST")
  ) {
    next();
    return;
  }

  // Check Authorization header first (priority)
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers["x-api-key"];
  const apiKey = typeof apiKeyHeader === "string" ? apiKeyHeader : undefined;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7); // Remove "Bearer " prefix
    const session = authService.validateToken(token);
    if (session) {
      // Attach session/user info to request for downstream handlers
      (req as any).user = session;
      next();
      return;
    }
    // Token present but invalid — reject
    res.status(401).json({ success: false, error: "Invalid or expired token" });
    return;
  }

  // Fallback: check httpOnly cookie for browser clients
  const cookieToken = (req as unknown as { cookies?: Record<string, string> })
    .cookies?.roblox_ai_token;
  if (cookieToken) {
    const session = authService.validateToken(cookieToken);
    if (session) {
      (req as any).user = session;
      // Attach token to Authorization header internally so downstream handlers can use it
      req.headers.authorization = `Bearer ${cookieToken}`;
      next();
      return;
    }
    // Cookie token invalid — fall through to 401
  }

  if (apiKey && apiKeyStore.validate(apiKey)) {
    // Registered API key authentication (Studio plugin, CI/CD)
    next();
    return;
  }

  res.status(401).json({ success: false, error: "Authentication required" });
}

// ─── Request Logger ─────────────────────────────────────────────────────────

let requestCounter = 0;

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = `req-${++requestCounter}-${Date.now().toString(36)}`;
  const start = Date.now();

  // Attach request ID
  (req as unknown as Record<string, unknown>).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  // Log on response finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    const log = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };
    // Structured JSON log
    console.log(JSON.stringify(log));
  });

  next();
}
