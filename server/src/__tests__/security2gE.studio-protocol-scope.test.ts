import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

describe("SECURITY-2G-E Studio protocol resource scoping", () => {
  it("authorizes protocol messages before dispatcher execution", () => {
    const block = handler(
      'router.post("/protocol/message", async (req, res) => {',
    );
    expect(block).toContain("resolveProtocolProjectId(message)");
    expect(block).toContain("requireStudioProjectAccess(req, res, projectId)");
    expect(block.indexOf("requireStudioProjectAccess")).toBeLessThan(
      block.indexOf("dispatcher.dispatch"),
    );
  });

  it("requires an owned project for protocol registration and artifact transfer", () => {
    for (const registration of [
      'router.post("/protocol/register", async (req, res) => {',
      'router.post("/sync/artifacts", async (req, res) => {',
    ]) {
      const block = handler(registration);
      expect(block).toContain('error: "projectId is required"');
      expect(block).toContain(
        "requireStudioProjectAccess(req, res, projectId)",
      );
    }
    expect(
      handler('router.post("/protocol/register", async (req, res) => {'),
    ).toContain("bridge.connect(studioVersion, projectId)");
  });

  it("filters protocol logs to the authorized client session", () => {
    const block = handler('router.get("/protocol/log", async (req, res) => {');
    expect(block).toContain("requireStudioClientAccess(req, res, clientId)");
    expect(block).toContain("entry.sessionId === session.sessionId");
  });

  it("keeps protocol info limited to static metadata", () => {
    const block = handler('router.get("/protocol/info", (_req, res) => {');
    expect(block).toContain("protocolVersion: PROTOCOL_VERSION");
    expect(block).not.toContain("getLog(");
    expect(block).not.toContain("getConnectedClients(");
  });
});
