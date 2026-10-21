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
  // MAR-001 moved the conversation routes onto the canonical helper, so the
  // strings this used to look for no longer exist. What it was really pinning
  // was ordering — authorization before the mutation — and that is kept here.
  // The behavioural proof now lives in mar001.conversation-ownership.test.ts,
  // which issues real cross-tenant requests instead of reading the file.
  it("authorizes before it reads, writes or deletes", () => {
    expect(route).toContain(
      "access.requireProjectAccess(req, res, req.params.projectId)",
    );
    expect(route).toContain("requireOwnedConversation");

    expect(
      route.indexOf("requireProjectAccess(req, res, req.params.projectId)"),
    ).toBeLessThan(route.indexOf("chatPersistence.getHistory"));
    expect(
      route.indexOf("requireOwnedConversation(req, res, conversationId)"),
    ).toBeLessThan(route.indexOf("chatPersistence.createMessage"));
    expect(
      route.lastIndexOf("requireOwnedConversation(req, res, req.params.id)"),
    ).toBeLessThan(route.indexOf("chatPersistence.deleteConversation"));
  });

  it("derives conversation authority from the conversation itself", () => {
    // The loader is the invariant: the project comes from the stored
    // conversation, never from anything the caller sent alongside it.
    expect(route).toContain(
      "projectOf: (conversation) => conversation.projectId",
    );
    expect(route).not.toContain("requireProjectAccess(req, res, conversation");
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
