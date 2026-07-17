/**
 * Unit tests for authApi.ts
 *
 * After the security hardening, tokens are delivered via httpOnly cookies.
 * The frontend no longer stores tokens in localStorage.
 * All fetch calls use `credentials: 'include'` so cookies are sent automatically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loginApi,
  registerApi,
  logoutApi,
  getMeApi,
  getStoredToken,
  storeTokens,
  clearTokens,
} from "../authApi";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock localStorage (still needed for clearTokens legacy cleanup)
const mockStorage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
});

beforeEach(() => {
  mockFetch.mockReset();
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("authApi", () => {
  describe("cookie-based auth - no localStorage token storage", () => {
    it("getStoredToken always returns null (tokens in cookies now)", () => {
      expect(getStoredToken()).toBeNull();
    });

    it("storeTokens is a no-op (tokens set by server in httpOnly cookies)", () => {
      storeTokens("tok_abc", "ref_xyz");
      // Should NOT store in localStorage
      expect(mockStorage["roblox_ai_token"]).toBeUndefined();
      expect(mockStorage["roblox_ai_refresh"]).toBeUndefined();
    });

    it("clearTokens removes legacy localStorage entries", () => {
      mockStorage["roblox_ai_token"] = "old";
      mockStorage["roblox_ai_refresh"] = "old_ref";
      clearTokens();
      expect(mockStorage["roblox_ai_token"]).toBeUndefined();
      expect(mockStorage["roblox_ai_refresh"]).toBeUndefined();
    });
  });

  describe("loginApi", () => {
    it("does NOT store tokens in localStorage on successful login", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: { id: "1", email: "a@b.com", displayName: "A" },
            token: "tok_abc",
            refreshToken: "ref_xyz",
          },
        }),
      });
      const result = await loginApi("a@b.com", "pass");
      expect(result.success).toBe(true);
      // Key assertion: localStorage must NOT have tokens
      expect(mockStorage["roblox_ai_token"]).toBeUndefined();
      expect(mockStorage["roblox_ai_refresh"]).toBeUndefined();
    });

    it("uses credentials: include for cookie delivery", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: { id: "1", email: "a@b.com", displayName: "A" },
            token: "tok_abc",
            refreshToken: "ref_xyz",
          },
        }),
      });
      await loginApi("a@b.com", "pass");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/platform/auth/login",
        expect.objectContaining({ credentials: "include" }),
      );
    });

    it("returns error on invalid credentials", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid credentials" }),
      });
      const result = await loginApi("a@b.com", "wrong");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });
  });

  describe("registerApi", () => {
    it("registers without storing tokens in localStorage", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: { id: "2", email: "b@c.com", displayName: "B" },
            token: "tok_new",
            refreshToken: "ref_new",
          },
        }),
      });
      const result = await registerApi("b@c.com", "pass", "B");
      expect(result.success).toBe(true);
      expect(result.data?.user.displayName).toBe("B");
      // No localStorage storage
      expect(mockStorage["roblox_ai_token"]).toBeUndefined();
      expect(mockStorage["roblox_ai_refresh"]).toBeUndefined();
    });

    it("uses credentials: include for cookie delivery", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: { id: "2", email: "b@c.com", displayName: "B" },
            token: "tok_new",
            refreshToken: "ref_new",
          },
        }),
      });
      await registerApi("b@c.com", "pass", "B");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/platform/auth/register",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  describe("logoutApi", () => {
    it("clears legacy localStorage entries and uses credentials: include", async () => {
      mockStorage["roblox_ai_token"] = "old";
      mockStorage["roblox_ai_refresh"] = "old_ref";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      await logoutApi();
      // Legacy localStorage is cleaned up
      expect(mockStorage["roblox_ai_token"]).toBeUndefined();
      expect(mockStorage["roblox_ai_refresh"]).toBeUndefined();
      // Uses credentials: include so server can clear httpOnly cookies
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/platform/auth/logout",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  describe("getMeApi", () => {
    it("calls /me with credentials: include (cookie-authenticated)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: { id: "1", email: "a@b.com", displayName: "A" },
            role: "creator",
          },
        }),
      });
      const result = await getMeApi();
      expect(result.success).toBe(true);
      expect(result.data?.user.id).toBe("1");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/platform/auth/me",
        expect.objectContaining({ credentials: "include" }),
      );
    });

    it("returns error when server rejects (no valid cookie)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "No token provided" }),
      });
      const result = await getMeApi();
      expect(result.success).toBe(false);
      expect(result.error).toBe("No token provided");
    });
  });
});
