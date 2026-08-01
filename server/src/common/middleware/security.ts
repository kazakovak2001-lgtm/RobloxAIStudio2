/**
 * Security Middleware — Rate limiting, CORS, auth, helmet, request logging.
 */

import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { authService } from "../../platform/auth/authServiceInstance";
import {
  ApiKeyStore,
  type ApiKeyPrincipal,
} from "../../platform/security/ApiKeyStore";
import {
  InMemoryStorageProvider,
  type StorageProvider,
} from "../../platform/storage/StorageProvider";

let apiKeyStore: ApiKeyStore | null = null;

export type ApiKeyAuthenticatedRequest = Request & {
  apiKeyPrincipal?: ApiKeyPrincipal;
};

export function getRequestApiKeyPrincipal(
  req: Request,
): ApiKeyPrincipal | null {
  return (req as ApiKeyAuthenticatedRequest).apiKeyPrincipal ?? null;
}

export function requireApiKeyCapability(
  req: Request,
  res: Response,
  capability: string,
  resourceScope: string,
): boolean {
  const principal = getRequestApiKeyPrincipal(req);
  if (!principal) return true;

  if (
    !principal.capabilities.includes(capability) ||
    !principal.resourceScopes.includes(resourceScope)
  ) {
    res.status(403).json({
      success: false,
      error: "API key capability or resource scope denied",
    });
    return false;
  }
  return true;
}

/** Use the same configured storage provider as the rest of the API process. */
export function configureApiKeyStore(storage: StorageProvider): ApiKeyStore {
  apiKeyStore = new ApiKeyStore(storage);
  return apiKeyStore;
}

export function getApiKeyStore(): ApiKeyStore {
  // Keeps isolated middleware tests dependency-free. The server bootstrap always
  // configures a shared provider before it starts accepting requests.
  apiKeyStore ??= new ApiKeyStore(new InMemoryStorageProvider());
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

/**
 * Return the one canonical browser origin configured for production.
 *
 * Development keeps its existing allow-all behavior in the HTTP and Socket.IO
 * middleware. Production fails closed when FRONTEND_URL is absent or invalid.
 */
export function getAllowedFrontendOrigins(): string[] {
  const configured = process.env.FRONTEND_URL?.trim();
  if (!configured) return [];

  try {
    return [new URL(configured).origin];
  } catch {
    return [];
  }
}

export function isFrontendOriginAllowed(origin: string): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return getAllowedFrontendOrigins().includes(origin);
}

export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;
  const isDev = process.env.NODE_ENV !== "production";

  // In development, preserve the permissive local workflow. Production uses
  // the same FRONTEND_URL policy as Socket.IO.
  if (isDev || (origin && isFrontendOriginAllowed(origin))) {
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

const PUBLIC_PATHS = ["/health", "/"];

const PUBLIC_PREFIXES = [
  "/api/platform/auth", // Auth routes (login, register, refresh, logout) must be public
];

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
    let session;
    try {
      session = await authService.validateToken(token);
    } catch {
      res.status(503).json({
        success: false,
        error: "Authentication persistence unavailable",
      });
      return;
    }
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
    let session;
    try {
      session = await authService.validateToken(cookieToken);
    } catch {
      res.status(503).json({
        success: false,
        error: "Authentication persistence unavailable",
      });
      return;
    }
    if (session) {
      (req as any).user = session;
      // Attach token to Authorization header internally so downstream handlers can use it
      req.headers.authorization = `Bearer ${cookieToken}`;
      next();
      return;
    }
    // Cookie token invalid — fall through to 401
  }

  const apiKeyPrincipal = apiKey
    ? getApiKeyStore().resolvePrincipal(apiKey)
    : null;
  if (apiKeyPrincipal) {
    // API keys authenticate as their own principal. They never gain an implicit
    // user identity or wildcard capability; unscoped legacy keys resolve with
    // empty capability and resource-scope arrays.
    (req as ApiKeyAuthenticatedRequest).apiKeyPrincipal = apiKeyPrincipal;
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
