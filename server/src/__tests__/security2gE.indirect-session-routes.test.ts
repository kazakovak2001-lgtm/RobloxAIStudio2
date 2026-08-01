import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = path.resolve(__dirname, "../routes/autonomous.ts");
const source = fs.readFileSync(sourcePath, "utf8");

function handler(operation: string): string {
  const escaped = operation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `router\\.(?:get|post)\\(\\s*["']${escaped}["'][\\s\\S]*?\\n  }\\);`,
    ),
  );
  expect(match, `missing handler for ${operation}`).not.toBeNull();
  return match![0];
}

describe("SECURITY-2G-E indirect autonomous session authorization", () => {
  it("resolves session ownership before exposing status or capabilities", () => {
    for (const operation of [
      "/status/:sessionId",
      "/capabilities/:sessionId",
    ]) {
      const body = handler(operation);
      expect(body).toContain("orchestrator.getSession(req.params.sessionId)");
      expect(body).toContain("session.projectId");
      expect(body).toContain("hasConcealedSessionAccess");
      expect(body.indexOf("hasConcealedSessionAccess")).toBeLessThan(
        body.indexOf("res.json({ success: true"),
      );
    }
  });

  it("resolves session ownership before lifecycle mutations", () => {
    for (const operation of [
      "/pause/:sessionId",
      "/resume/:sessionId",
      "/recover/:sessionId",
      "/cancel/:sessionId",
    ]) {
      const body = handler(operation);
      expect(body).toContain(
        "hasSessionAccess(req, res, req.params.sessionId)",
      );
      expect(body.indexOf("hasSessionAccess")).toBeLessThan(
        body.indexOf("orchestrator."),
      );
    }
  });

  it("conceals foreign or missing sessions instead of leaking project identity", () => {
    expect(source).toContain(
      'res.status(404).json({ success: false, error: "Session not found" })',
    );
    expect(source).toContain(
      "access.hasProjectAccess(req, session.projectId)",
    );
  });
});
