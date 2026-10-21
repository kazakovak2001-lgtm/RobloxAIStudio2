/**
 * MAR-001 — a refusal must not describe what it refused.
 *
 * The Studio command routes authorize the caller for a client and then act on a
 * `commandId` taken from the URL. The binding was checked, so a caller could not
 * acknowledge another tenant's command — but the refusal answered 403 with the
 * command's lifecycle status, while a command that did not exist answered 404.
 *
 * Two things leaked from that difference: that the command existed, and what
 * state it was in. Neither belongs to the caller. This pins the property that
 * closes it — the two answers are indistinguishable — rather than pinning the
 * status code, which is only how the property happens to be expressed today.
 *
 * The runtime still reports `client_mismatch` internally. The server keeps
 * knowing the difference; it just stops telling the caller.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { StudioRuntime } from "../studio/v2/StudioRuntime";
import { createProjectRuntime } from "../routes/projects";
import { createStudioRouter } from "../routes/studio";

const OWNER_A = { token: "token-a", userId: "user-a" };
const OWNER_B = { token: "token-b", userId: "user-b" };

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

/**
 * Two owners, two projects, and a real queued export command in the first.
 * The second owner is a legitimate user with a legitimate client — the point is
 * that legitimacy for one project buys nothing in another.
 */
async function startTwoTenants() {
  const storage = new InMemoryStorageProvider();
  const auth = {
    validateToken: async (token: string) => {
      if (token === OWNER_A.token) return { userId: OWNER_A.userId };
      if (token === OWNER_B.token) return { userId: OWNER_B.userId };
      return null;
    },
  };
  const projectRuntime = createProjectRuntime(storage, auth as never);

  const projectA = await projectRuntime.projectRepository.createDurable(
    OWNER_A.userId,
    "Tenant A",
    "adventure",
    "First tenant",
    {},
  );
  const projectB = await projectRuntime.projectRepository.createDurable(
    OWNER_B.userId,
    "Tenant B",
    "adventure",
    "Second tenant",
    {},
  );

  runtime = new StudioRuntime({ storage });
  const executionId = "execution-mar001";
  runtime.artifacts.store(
    executionId,
    "LUA_GENERATION",
    "lua_generator",
    {
      scripts: [
        { path: "ServerScriptService/Main.server.lua", content: "return true" },
      ],
    },
    { projectId: projectA.id },
  );
  runtime.artifacts.store(
    executionId,
    "EXPORT",
    "orchestrator",
    { manifest: { scripts: 1 } },
    { projectId: projectA.id },
  );

  const clientA = runtime.bridge.connect("0.650", projectA.id);
  runtime.sessions.create(clientA);
  const queued = await runtime.queueProjectExport(
    clientA.clientId,
    projectA.id,
    executionId,
  );
  if (!queued.success || !queued.data.command) {
    throw new Error("Expected a queued EXPORT_PROJECT command");
  }

  const clientB = runtime.bridge.connect("0.650", projectB.id);
  runtime.sessions.create(clientB);

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
    foreignCommandId: queued.data.command.id,
    intruderClientId: clientB.clientId,
  };
}

async function readAnswer(response: globalThis.Response) {
  return { status: response.status, body: await response.json() };
}

describe("MAR-001 Studio command ownership concealment", () => {
  it("answers identically for another tenant's command and a missing one", async () => {
    const { base, foreignCommandId, intruderClientId } =
      await startTwoTenants();

    const foreign = await readAnswer(
      await fetch(
        `${base}/commands/${foreignCommandId}?clientId=${intruderClientId}`,
        { headers: { authorization: `Bearer ${OWNER_B.token}` } },
      ),
    );
    const missing = await readAnswer(
      await fetch(
        `${base}/commands/command-that-does-not-exist?clientId=${intruderClientId}`,
        { headers: { authorization: `Bearer ${OWNER_B.token}` } },
      ),
    );

    // The whole property in one assertion: the caller cannot tell the two apart.
    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
  });

  it("does not report another tenant's command state when acknowledgement is refused", async () => {
    const { base, foreignCommandId, intruderClientId } =
      await startTwoTenants();

    const foreign = await readAnswer(
      await fetch(`${base}/commands/${foreignCommandId}/acknowledge`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${OWNER_B.token}`,
        },
        body: JSON.stringify({ clientId: intruderClientId }),
      }),
    );
    const missing = await readAnswer(
      await fetch(`${base}/commands/no-such-command/acknowledge`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${OWNER_B.token}`,
        },
        body: JSON.stringify({ clientId: intruderClientId }),
      }),
    );

    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
    // The status of the other tenant's command is the specific thing that used
    // to travel out on this path.
    expect(JSON.stringify(foreign.body)).not.toContain("sent");
    expect(foreign.body).not.toHaveProperty("data");
  });

  it("does not report another tenant's command state when a result is refused", async () => {
    const { base, foreignCommandId, intruderClientId } =
      await startTwoTenants();

    const send = (commandId: string) =>
      fetch(`${base}/commands/${commandId}/result`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${OWNER_B.token}`,
        },
        body: JSON.stringify({
          clientId: intruderClientId,
          status: "completed",
          executionId: "execution-mar001",
          artifacts: [],
        }),
      });

    const foreign = await readAnswer(await send(foreignCommandId));
    const missing = await readAnswer(await send("no-such-command"));

    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
  });

  it("still refuses the command outright rather than acting on it", async () => {
    const { base, foreignCommandId, intruderClientId } =
      await startTwoTenants();

    await fetch(`${base}/commands/${foreignCommandId}/acknowledge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OWNER_B.token}`,
      },
      body: JSON.stringify({ clientId: intruderClientId }),
    });

    // Concealment is not the only requirement. A refusal that quietly performed
    // the mutation would satisfy every assertion above and be far worse.
    const command = await runtime?.getCommand(foreignCommandId);
    expect(command?.status).toBe("sent");
    expect(command?.acknowledgedAt).toBeUndefined();
  });
});
