import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const studioSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/studio.ts"),
  "utf8",
);
const socketSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/socket/index.ts"),
  "utf8",
);

function route(registration: string): string {
  const start = studioSource.indexOf(registration);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = studioSource.indexOf("\n  router.", start + registration.length);
  return studioSource.slice(start, next < 0 ? studioSource.length : next);
}

describe("SECURITY-2G-E Studio REST and Socket.IO project parity", () => {
  it("keeps Socket.IO project join fail-closed", () => {
    const joinStart = socketSource.indexOf('socket.on("project:join"');
    const leaveStart = socketSource.indexOf('socket.on("project:leave"');
    expect(joinStart).toBeGreaterThanOrEqual(0);
    expect(leaveStart).toBeGreaterThan(joinStart);
    const join = socketSource.slice(joinStart, leaveStart);
    expect(join).toContain(
      "canJoinProject(projectId.trim(), authenticatedUserId)",
    );
    expect(join).toContain('error: "Project access denied"');
    expect(join.indexOf("canJoinProject(")).toBeLessThan(
      join.indexOf("socket.join("),
    );
  });

  it("guards project-bound Studio REST operations before runtime access", () => {
    const cases = [
      {
        registration: 'router.post("/connect", async (req, res) => {',
        guard: "requireStudioProjectAccess(req, res, projectId)",
        protectedCall: "bridge.connect(studioVersion, projectId)",
      },
      {
        registration: 'router.post("/sync/project", async (req, res) => {',
        guard: "requireStudioProjectAccess(req, res, projectId)",
        protectedCall: "runtime.getProjectSnapshot(projectId)",
      },
      {
        registration: 'router.get("/sync/status", async (req, res) => {',
        guard: "requireStudioProjectAccess(req, res, projectId)",
        protectedCall: "runtime.getSyncStatus(projectId)",
      },
    ];

    for (const item of cases) {
      const body = route(item.registration);
      expect(body).toContain(item.guard);
      expect(body.indexOf(item.guard)).toBeLessThan(
        body.indexOf(item.protectedCall),
      );
    }
  });
});
