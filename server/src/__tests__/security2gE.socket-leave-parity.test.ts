import { describe, expect, it } from "vitest";
import fs from "node:fs";

const socketSource = fs.readFileSync("server/src/socket/index.ts", "utf8");
const matrix = JSON.parse(
  fs.readFileSync("config/security/authorization-matrix.json", "utf8"),
) as {
  operations: Array<{
    transport: string;
    source: string;
    operation: string;
    classification: string;
    principal: string;
    capability: string;
    resourceScope: string;
    positiveEvidence: string;
    negativeEvidence: string;
  }>;
};

describe("SECURITY-2G-E Socket.IO leave parity", () => {
  it("rejects malformed, foreign, or no-longer-authorized leave events", () => {
    const handler = socketSource.slice(
      socketSource.indexOf('socket.on("project:leave"'),
      socketSource.indexOf('socket.on("disconnect"'),
    );

    expect(handler).toContain('typeof projectId !== "string"');
    expect(handler).toContain("!projectId.trim()");
    expect(handler).toContain("player.projectId !== projectId.trim()");
    expect(handler).toContain(
      "!canJoinProject(projectId.trim(), authenticatedUserId)",
    );
    expect(handler).toContain('error: "Project access denied"');
    expect(
      handler.indexOf("player.projectId !== projectId.trim()"),
    ).toBeLessThan(handler.indexOf("socket.leave"));
  });

  it("clears joined-project state only after an authorized leave", () => {
    const handler = socketSource.slice(
      socketSource.indexOf('socket.on("project:leave"'),
      socketSource.indexOf('socket.on("disconnect"'),
    );

    expect(handler).toContain("projectId = projectId.trim()");
    expect(handler).toContain("this.untrackProjectRoom(projectId, socket.id)");
    expect(handler).toContain("player.projectId = undefined");
    expect(handler.indexOf("socket.leave")).toBeLessThan(
      handler.indexOf("player.projectId = undefined"),
    );
    expect(handler.indexOf("player.projectId = undefined")).toBeLessThan(
      handler.indexOf('emit("player:left"'),
    );
  });

  it("records complete matrix evidence for project:leave", () => {
    const entry = matrix.operations.find(
      (item) =>
        item.transport === "socket" &&
        item.source === "server/src/socket/index.ts" &&
        item.operation === "project:leave",
    );

    expect(entry).toMatchObject({
      classification: "authenticated",
      principal: "user-session",
      capability: "project.room.leave",
      resourceScope: "joined-project",
      positiveEvidence:
        "server/src/__tests__/security2gE.socket-leave-parity.test.ts",
      negativeEvidence:
        "server/src/__tests__/security2gE.socket-leave-parity.test.ts",
    });
  });
});
