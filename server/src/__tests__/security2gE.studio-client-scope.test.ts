import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// This contract test intentionally inspects route ordering and fail-closed guards.
const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/studio.ts"),
  "utf8",
);

function handler(operation: string): string {
  const start = source.indexOf(operation);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\n  router.", start + operation.length);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("SECURITY-2G-E Studio client resource scoping", () => {
  it("filters global client, session, and event views by project ownership", () => {
    const status = handler('router.get("/status", async (req, res) => {');
    expect(status).toContain("filterAuthorizedClients(");
    expect(status).toContain("bridge.getConnectedClients()");

    expect(handler('router.get("/session", async (req, res) => {')).toContain(
      "requireStudioClientAccess(req, res, clientId)",
    );

    const events = handler('router.get("/events", async (req, res) => {');
    expect(events).toContain("filterAuthorizedEvents(");
    expect(events).toContain("bridge.events.getHistory()");
  });

  it("guards command reads and mutations through the owning Studio client", () => {
    for (const registration of [
      'router.get("/commands", async (req, res) => {',
      'router.get("/commands/:commandId", async (req, res) => {',
      'router.post("/commands/:commandId/acknowledge", async (req, res) => {',
      'router.post("/commands/:commandId/result", async (req, res) => {',
    ]) {
      expect(handler(registration)).toContain(
        "requireStudioClientAccess(req, res, clientId)",
      );
    }
  });

  it("conceals foreign and missing Studio clients with the same response", () => {
    expect(source).toContain(
      'res.status(404).json({ success: false, error: "Client not found" })',
    );
    expect(source).toMatch(
      /access\.hasProjectAccess\(\s*req,\s*projectId,\s*STUDIO_PROJECT_ACCESS_CAPABILITY/,
    );
  });
});
