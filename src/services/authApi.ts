/**
 * Auth API client — frontend service for real authentication.
 *
 * Token storage has been moved to httpOnly cookies set by the server.
 * The frontend no longer stores tokens in localStorage.
 * All fetch calls use `credentials: 'include'` so cookies are sent automatically.
 */

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  tier?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
  refreshToken: string;
  role?: string;
}

/**
 * @deprecated Tokens are now stored in httpOnly cookies. This is a no-op for backward compatibility.
 */
export function getStoredToken(): string | null {
  // No longer reads from localStorage — cookies are managed by the browser automatically
  return null;
}

/**
 * @deprecated Tokens are now stored in httpOnly cookies. This is a no-op for backward compatibility.
 */
export function storeTokens(_token: string, _refreshToken: string): void {
  // No-op: tokens are now delivered via httpOnly cookies by the server
}

/**
 * @deprecated Tokens are now stored in httpOnly cookies. This is a no-op for backward compatibility.
 */
export function clearTokens(): void {
  // No-op: cookies are cleared by the server on logout
  // Also clear any legacy localStorage entries that may exist
  localStorage.removeItem("roblox_ai_token");
  localStorage.removeItem("roblox_ai_refresh");
}

export async function loginApi(
  email: string,
  password: string,
): Promise<{
  success: boolean;
  data?: AuthResponse;
  error?: string;
}> {
  try {
    const res = await fetch("/api/platform/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function registerApi(
  email: string,
  password: string,
  displayName: string,
): Promise<{
  success: boolean;
  data?: AuthResponse;
  error?: string;
}> {
  try {
    const res = await fetch("/api/platform/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, displayName }),
    });
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function logoutApi(): Promise<void> {
  try {
    await fetch("/api/platform/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch {
    /* ignore */
  }
  clearTokens();
}

export async function getMeApi(): Promise<{
  success: boolean;
  data?: { user: AuthUser; role: string };
  error?: string;
}> {
  try {
    const res = await fetch("/api/platform/auth/me", {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function refreshTokenApi(): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/platform/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json.error };
    }
    return { success: true, token: json.data.token };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
