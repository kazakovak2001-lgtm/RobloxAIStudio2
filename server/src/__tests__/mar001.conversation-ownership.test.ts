/**
 * MAR-001 — conversation ownership, migrated to the canonical helper.
 *
 * The conversation routes resolved correctly: they loaded the conversation and
 * authorized its own project, so no caller could read or delete another
 * tenant's conversation. What differed was the refusal. A conversation that did
 * not exist answered "Conversation not found"; one that existed in another
 * tenant's project fell through to the project access control and answered
 * "Project not found". The two bodies told a caller which conversation ids were
 * real.
 *
 * This is the same disclosure closed for Studio commands, Studio clients and
 * projects. Here it is closed by using `requireOwned`, which loads the
 * conversation, derives the project from it, and answers both cases through
 * `denyAsAbsent`.
 *
 * The group was chosen for risk rather than size: `DELETE /conversation/:id`
 * destroys data, and `POST /message` carries two identifiers at once, which is
 * the shape that produced SEC-STUDIO-PROTOCOL-BINDING-001. That shape turned
 * out to be sound here — the service ignores the caller's projectId whenever a
 * conversation is named — and the test below pins it so it stays that way.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { ChatPersistenceService } from "../services/ChatPersistenceService";
import { createProjectRuntime } from "../routes/projects";
import { createChatPersistenceRouter } from "../routes/chatPersistence";

const OWNER = { token: "token-owner", userId: "user-owner" };
const INTRUDER = { token: "token-intruder", userId: "user-intruder" };

let server: Server | undefined;
let chat: ChatPersistenceService | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
  chat = undefined;
});

async function startTenants() {
  const storage = new InMemoryStorageProvider();
  const auth = {
    validateToken: async (token: string) => {
      if (token === OWNER.token) return { userId: OWNER.userId };
      if (token === INTRUDER.token) return { userId: INTRUDER.userId };
      return null;
    },
  };
  const runtime = createProjectRuntime(storage, auth as never);

  const ownerProject = await runtime.projectRepository.createDurable(
    OWNER.userId,
    "Owner project",
    "adventure",
    "Holds the conversation",
    {},
  );
  const intruderProject = await runtime.projectRepository.createDurable(
    INTRUDER.userId,
    "Intruder project",
    "adventure",
    "The caller's own",
    {},
  );

  chat = new ChatPersistenceService(storage);
  const seeded = await chat.createMessage({
    projectId: ownerProject.id,
    role: "user",
    content: "a private design note the intruder must not read",
  });

  const app = express();
  app.use(express.json());
  app.use("/api/chat", createChatPersistenceRouter(runtime.access, chat));
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }

  return {
    base: `http://127.0.0.1:${address.port}/api/chat`,
    conversationId: seeded.conversationId,
    intruderProjectId: intruderProject.id,
  };
}

function send(
  base: string,
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function read(response: globalThis.Response) {
  return { status: response.status, body: await response.json() };
}

describe("MAR-001 conversation existence is not disclosed", () => {
  it("answers identically for another tenant's conversation and a missing one", async () => {
    const { base, conversationId } = await startTenants();

    const foreign = await read(
      await send(base, `/conversation/${conversationId}`, INTRUDER.token),
    );
    const missing = await read(
      await send(
        base,
        "/conversation/conversation-does-not-exist",
        INTRUDER.token,
      ),
    );

    // Before this slice: "Project not found" against "Conversation not found".
    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
  });

  it("answers identically when deleting either", async () => {
    const { base, conversationId } = await startTenants();

    const foreign = await read(
      await send(
        base,
        `/conversation/${conversationId}`,
        INTRUDER.token,
        "DELETE",
      ),
    );
    const missing = await read(
      await send(base, "/conversation/nope", INTRUDER.token, "DELETE"),
    );

    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
  });

  it("does not delete the conversation it refuses", async () => {
    const { base, conversationId } = await startTenants();

    await send(
      base,
      `/conversation/${conversationId}`,
      INTRUDER.token,
      "DELETE",
    );

    // The side effect is the point. A refusal that destroyed the data anyway
    // would satisfy every status assertion above.
    expect(chat?.getConversation(conversationId)).not.toBeNull();
  });

  it("says nothing of the conversation it refuses", async () => {
    const { base, conversationId } = await startTenants();

    const foreign = await read(
      await send(base, `/conversation/${conversationId}`, INTRUDER.token),
    );

    expect(JSON.stringify(foreign.body)).not.toContain("private design note");
    expect(foreign.body).toEqual({
      success: false,
      error: "Conversation not found",
    });
  });
});

describe("MAR-001 posting a message names one authority", () => {
  it("refuses a foreign conversation and writes nothing", async () => {
    const { base, conversationId, intruderProjectId } = await startTenants();
    const before = chat?.getConversation(conversationId)?.messages.length ?? 0;

    const response = await read(
      await send(base, "/message", INTRUDER.token, "POST", {
        conversationId,
        // A project the caller really does own, offered beside a conversation
        // they do not. This is the shape that produced the Studio protocol
        // defect, so it is pinned rather than assumed.
        projectId: intruderProjectId,
        role: "user",
        content: "injected",
      }),
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: "Conversation not found",
    });
    expect(chat?.getConversation(conversationId)?.messages.length).toBe(before);
  });

  it("keeps a message in the conversation's project, not the one the caller names", async () => {
    const { base, conversationId, intruderProjectId } = await startTenants();

    // The owner may post, and may also name a wrong project while doing it.
    // The message must follow the conversation regardless.
    const response = await read(
      await send(base, "/message", OWNER.token, "POST", {
        conversationId,
        projectId: intruderProjectId,
        role: "user",
        content: "second message",
      }),
    );

    expect(response.status).toBe(201);
    const conversation = chat?.getConversation(conversationId);
    expect(conversation?.messages.length).toBe(2);
    // Ownership did not move to the project named in the request body.
    expect(conversation?.projectId).not.toBe(intruderProjectId);
  });

  it("still lets the owner read and delete their own conversation", async () => {
    const { base, conversationId } = await startTenants();

    // Without this, every refusal above would also hold if the routes were
    // broken for everyone.
    const owned = await read(
      await send(base, `/conversation/${conversationId}`, OWNER.token),
    );
    expect(owned.status).toBe(200);

    const deleted = await read(
      await send(
        base,
        `/conversation/${conversationId}`,
        OWNER.token,
        "DELETE",
      ),
    );
    expect(deleted.status).toBe(200);
    expect(chat?.getConversation(conversationId)).toBeNull();
  });
});
