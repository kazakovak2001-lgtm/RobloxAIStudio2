/**
 * Cookie Utilities — Secure httpOnly cookie management for auth tokens.
 *
 * Replaces localStorage token storage with server-side httpOnly cookies
 * that are inaccessible to JavaScript (mitigating XSS token theft).
 */

import type { Response, Request } from "express";

const ACCESS_TOKEN_COOKIE = "roblox_ai_token";
const REFRESH_TOKEN_COOKIE = "roblox_ai_refresh";

const ACCESS_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Sets httpOnly auth cookies on the response after successful login/register/refresh.
 */
export function setAuthCookies(
  res: Response,
  token: string,
  refreshToken: string,
): void {
  const isProduction = process.env.NODE_ENV === "production";

  // Remove the legacy API-scoped cookie before issuing the root-scoped cookie.
  // Socket.IO handshakes use /socket.io, so an /api-only access cookie can
  // authenticate REST calls but can never authenticate browser realtime.
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api",
  });
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/platform/auth/refresh",
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

/**
 * Clears auth cookies on logout.
 */
export function clearAuthCookies(res: Response): void {
  const isProduction = process.env.NODE_ENV === "production";

  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });
  // Also clear pre-migration sessions that used the narrower path.
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api",
  });

  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/platform/auth/refresh",
  });
}

/**
 * Extracts the access token from the request cookies.
 * Returns null if no cookie token is present.
 */
export function getTokenFromCookies(req: Request): string | null {
  return (
    (req as unknown as { cookies?: Record<string, string> }).cookies?.[
      ACCESS_TOKEN_COOKIE
    ] ?? null
  );
}

/**
 * Extracts the refresh token from the request cookies.
 * Returns null if no cookie refresh token is present.
 */
export function getRefreshTokenFromCookies(req: Request): string | null {
  return (
    (req as unknown as { cookies?: Record<string, string> }).cookies?.[
      REFRESH_TOKEN_COOKIE
    ] ?? null
  );
}
