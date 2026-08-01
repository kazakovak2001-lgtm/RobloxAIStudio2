import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "server/src/routes/chatPersistence.ts"),
  "utf8",
);
const matrix = JSON.parse(
  fs.readFileSync(
    path.join(root, "config/security/authorization-matrix.json"),
    "utf8",
  ),
) as {
  operations: Array<{
    source: string;
    operation: string;
    classification: string;
    principal: string;
    capability: string;
    resourceScope: string;
  }>;
};

describe("SECURITY-2G-E chat persistence scope", () => {
  it("guards direct and resolved project chat resources", () => {
    expect(route).toContain(
      "access.requireProjectAccess(req, res, req.params.projectId)",
    );
    expect(route).toContain(
      "access.requireProjectAccess(req, res, conversation.projectId)",
    );
    expect(route).toContain(
      "access.requireProjectAccess(req, res, projectId)",
    );
    expect(route.indexOf("requireProjectAccess(req, res, req.params.projectId)")).toBeLessThan(
      route.indexOf("chatPersistence.getHistory"),
    );
    expect(route.indexOf("requireProjectAccess(req, res, conversation.projectId)")).toBeLessThan(
      route.indexOf("chatPersistence.createMessage"),
    );
    expect(route.lastIndexOf("requireProjectAccess(req, res, conversation.projectId)")).toBeLessThan(
      route.indexOf("chatPersistence.deleteConversation"),
    );
  });

  it("classifies all four chat persistence operations", () => {
    const operations = matrix.operations.filter(
      (item) => item.source === "server/src/routes/chatPersistence.ts",
    );
    expect(operations).toHaveLength(4);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "GET /:projectId/history",
          classification: "project-owner",
          principal: "user-session",
          capability: "project.chat.history.read",
          resourceScope: "path-project",
        }),
        expect.objectContaining({
          operation: "GET /conversation/:id",
          classification: "project-owner",
          capability: "project.chat.conversation.read",
          resourceScope: "resolved-conversation-project",
        }),
        expect.objectContaining({
          operation: "POST /message",
          classification: "project-owner",
          capability: "project.chat.message.create",
          resourceScope: "body-or-resolved-conversation-project",
        }),
        expect.objectContaining({
          operation: "DELETE /conversation/:id",
          classification: "project-owner",
          capability: "project.chat.conversation.delete",
          resourceScope: "resolved-conversation-project",
        }),
      ]),
    );
  });
});
