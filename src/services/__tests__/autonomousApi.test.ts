/**
 * Unit tests for autonomousApi.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startAutonomousRun,
  getAutonomousStatus,
  pauseAutonomous,
  resumeAutonomous,
  cancelAutonomous,
} from "../autonomousApi";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("autonomousApi", () => {
  describe("startAutonomousRun", () => {
    it("starts a run and returns sessionId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            sessionId: "orch-abc123",
            status: "running",
            currentPhase: "genre_detection",
          },
        }),
      });
      const result = await startAutonomousRun({
        prompt: "Mining sim with pets",
        projectId: "proj-1",
      });
      expect(result.success).toBe(true);
      expect(result.data?.sessionId).toBe("orch-abc123");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/autonomous/run",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns error for short prompt", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "prompt is required (min 5 chars)" }),
      });
      const result = await startAutonomousRun({
        prompt: "hi",
        projectId: "p1",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("min 5 chars");
    });
  });

  describe("getAutonomousStatus", () => {
    it("returns session data", async () => {
      const mockSession = {
        id: "orch-abc",
        status: "running",
        currentPhase: "blueprint",
        qualityScore: 0,
        cost: { totalTokens: 200, totalCost: 0.0004, totalTimeMs: 500 },
        phases: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockSession }),
      });
      const result = await getAutonomousStatus("orch-abc");
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("running");
    });

    it("returns error for unknown session", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Session not found" }),
      });
      const result = await getAutonomousStatus("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  describe("pauseAutonomous", () => {
    it("pauses session", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: "paused" } }),
      });
      const result = await pauseAutonomous("orch-abc");
      expect(result.success).toBe(true);
    });
  });

  describe("resumeAutonomous", () => {
    it("resumes session", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: "running" } }),
      });
      const result = await resumeAutonomous("orch-abc");
      expect(result.success).toBe(true);
    });
  });

  describe("cancelAutonomous", () => {
    it("cancels session", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: "cancelled" } }),
      });
      const result = await cancelAutonomous("orch-abc");
      expect(result.success).toBe(true);
    });

    it("handles network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Offline"));
      const result = await cancelAutonomous("orch-abc");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Offline");
    });
  });
});
