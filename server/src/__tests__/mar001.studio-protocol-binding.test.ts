/**
 * MAR-001 — authorize the thing the operation acts on.
 *
 * Three defects in the Studio surface, one root cause seen from different
 * places.
 *
 * The protocol transport authorized `payload.projectId` and then dispatched
 * handlers that act on `payload.clientId`. A caller could present a project they
 * legitimately own for the access check and a client belonging to another tenant
 * for the work. The runtime's own client-to-command check did not catch it,
 * because both identifiers named the same foreign client consistently — it was
 * the authorization that pointed somewhere else entirely.
 *
 * The command disclosure closed on the REST path was still reachable here, which
 * is what fixing a route rather than a rule costs: two transports, one runtime.
 *
 * And `GET /status` filtered its client list to the caller while reporting a
 * platform-wide session count beside it.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { StudioRuntime } from "../studio/v2/StudioRuntime";
import { PROTOCOL_VERSION } from "../studio/v2/protocol";
import { createProjectRuntime } from "../routes/projects";
import { createStudioRouter } from "../routes/studio";

const OWNER = { token: "token-a", userId: "user-a" };
const INTRUDER = { token: "token-b", userId: "user-b" };

let server: Server | undefined;
let runtime: StudioRuntime | undefined;

afterEach(async () => {
  runtime?.stopTimeoutMonitor();
  server?.closeAllConnections();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
  runtime = undefined;
});

/** A message the protocol validator actually accepts. */
function ackMessage(messageId: string, payload: Record<string, unknown>) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId,
    sessionId: "session-mar001",
    type: "COMMAND_ACK",
    command: "COMMAND_ACK",
    timestamp: Date.now(),
    direction: "client_to_server",
    payload,
  };
}

function post(token: string, body: unknown) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  };
}

async function startTenants() {
  const storage = new InMemoryStorageProvider();
  const auth = {
    validateToken: async (token: string) => {
      if (token === OWNER.token) return { userId: OWNER.userId };
      if (token === INTRUDER.token) return { userId: INTRUDER.userId };
      return null;
    },
  };
  const projectRuntime = createProjectRuntime(storage, auth as never);

  const ownerProject = await projectRuntime.projectRepository.createDurable(
    OWNER.userId,
    "Owner tenant",
    "adventure",
    "Owns the client and the command",
    {},
  );
  const intruderProject = await projectRuntime.projectRepository.createDurable(
    INTRUDER.userId,
    "Intruder tenant",
    "adventure",
    "Legitimately owned by the caller",
    {},
  );

  runtime = new StudioRuntime({ storage });
  const executionId = "execution-mar001-protocol";
  runtime.artifacts.store(
    executionId,
    "LUA_GENERATION",
    "lua_generator",
    {
      scripts: [
        { path: "ServerScriptService/Main.server.lua", content: "return true" },
      ],
    },
    { projectId: ownerProject.id },
  );
  runtime.artifacts.store(
    executionId,
    "EXPORT",
    "orchestrator",
    { manifest: { scripts: 1 } },
    { projectId: ownerProject.id },
  );

  const ownerClient = runtime.bridge.connect("0.650", ownerProject.id);
  runtime.sessions.create(ownerClient);
  const queued = await runtime.queueProjectExport(
    ownerClient.clientId,
    ownerProject.id,
    executionId,
  );
  if (!queued.success || !queued.data.command) {
    throw new Error("Expected a queued EXPORT_PROJECT command");
  }

  // Acknowledgement is refused before delivery, so a fixture that stopped short
  // would make every "the intruder could not acknowledge it" assertion pass for
  // the wrong reason.
  const delivered = await runtime.drainCommands(ownerClient.clientId);
  if (delivered.length !== 1) {
    throw new Error(`Fixture delivered ${delivered.length} commands, wanted 1`);
  }

  // A second client inside the owner's own project. Authorization succeeds for
  // it, so it is how the client-mismatch path stays reachable at all once the
  // binding fix stops cross-tenant callers from reaching the handler.
  const siblingClient = runtime.bridge.connect("0.650", ownerProject.id);
  runtime.sessions.create(siblingClient);

  const intruderClient = runtime.bridge.connect("0.650", intruderProject.id);
  runtime.sessions.create(intruderClient);

  const app = express();
  app.use(express.json());
  app.use("/api/studio", createStudioRouter(runtime, projectRuntime.access));
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }

  return {
    base: `http://127.0.0.1:${address.port}/api/studio`,
    ownerClientId: ownerClient.clientId,
    siblingClientId: siblingClient.clientId,
    commandId: queued.data.command.id,
    intruderProjectId: intruderProject.id,
    intruderClientId: intruderClient.clientId,
  };
}

describe("MAR-001 Studio protocol authorization binding", () => {
  it("refuses a message whose stated project is not the named client's", async () => {
    const { base, ownerClientId, commandId, intruderProjectId } =
      await startTenants();

    const response = await fetch(
      `${base}/protocol/message`,
      post(
        INTRUDER.token,
        // The access check used to run against this projectId while the handler
        // acted on the clientId beside it.
        ackMessage("msg-1", {
          projectId: intruderProjectId,
          clientId: ownerClientId,
          commandId,
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Client not found",
    });
  });

  it("does not acknowledge another tenant's command, but the owner still can", async () => {
    const { base, ownerClientId, commandId, intruderProjectId } =
      await startTenants();

    await fetch(
      `${base}/protocol/message`,
      post(
        INTRUDER.token,
        ackMessage("msg-2", {
          projectId: intruderProjectId,
          clientId: ownerClientId,
          commandId,
        }),
      ),
    );

    expect((await runtime?.getCommand(commandId))?.status).toBe("sent");

    // The positive control. Without it the assertion above would also hold if
    // the command simply could not be acknowledged by anyone, and this test
    // would pass while proving nothing — which is exactly what it did before
    // the message shape was corrected.
    const owner = await fetch(
      `${base}/protocol/message`,
      post(
        OWNER.token,
        ackMessage("msg-2b", { clientId: ownerClientId, commandId }),
      ),
    );
    await expect(owner.json()).resolves.toMatchObject({
      data: { status: "ok" },
    });
    expect((await runtime?.getCommand(commandId))?.status).toBe("acknowledged");
  });

  it("refuses identically whether the named client exists or not", async () => {
    const { base, ownerClientId, intruderProjectId } = await startTenants();

    const read = async (clientId: string) => {
      const response = await fetch(
        `${base}/protocol/message`,
        post(
          INTRUDER.token,
          ackMessage("msg-3", {
            projectId: intruderProjectId,
            clientId,
            commandId: "any-command",
          }),
        ),
      );
      return { status: response.status, body: await response.json() };
    };

    expect(await read(ownerClientId)).toEqual(
      await read("client-that-does-not-exist"),
    );
  });

  it("still dispatches a message whose client and project agree", async () => {
    const { base, intruderProjectId, intruderClientId } = await startTenants();

    const response = await fetch(
      `${base}/protocol/message`,
      post(
        INTRUDER.token,
        ackMessage("msg-4", {
          projectId: intruderProjectId,
          clientId: intruderClientId,
          commandId: "no-such-command",
        }),
      ),
    );

    // The binding rule must not turn away a caller acting on their own client.
    // The handler answers that the command does not exist, which is a different
    // outcome from being refused at the door.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { status: "error", payload: { reason: "command_not_found" } },
    });
  });
});

describe("MAR-001 Studio protocol command disclosure", () => {
  it("does not reveal that a command belongs to another client", async () => {
    const { base, siblingClientId, commandId } = await startTenants();

    // Authorized for the project, naming a sibling client in it, acting on a
    // command owned by a different client. This is the client-mismatch path
    // that remains reachable after the binding fix.
    const response = await fetch(
      `${base}/protocol/message`,
      post(
        OWNER.token,
        ackMessage("msg-5", { clientId: siblingClientId, commandId }),
      ),
    );

    const text = await response.text();
    expect(text).not.toContain("client_mismatch");
    expect(text).not.toContain("belongs to a different client");
    expect(text).not.toContain("commandStatus");
    expect(text).toContain("command_not_found");
  });
});

describe("MAR-001 Studio status counts", () => {
  it("counts only the caller's own sessions", async () => {
    const { base } = await startTenants();

    const response = await fetch(`${base}/status`, {
      headers: { authorization: `Bearer ${INTRUDER.token}` },
    });
    const body = (await response.json()) as {
      data: { clientCount: number; sessionCount: number };
    };

    // Three sessions exist: two in the owner's project, one in the intruder's.
    // A caller who can see one client must not be told there are three.
    expect(body.data.clientCount).toBe(1);
    expect(body.data.sessionCount).toBe(1);
  });
});
