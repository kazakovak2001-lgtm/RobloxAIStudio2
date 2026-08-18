/**
 * MAR-001 — autonomous session control, verified rather than migrated.
 *
 * `hasSessionAccess` already does the right thing: it loads the session,
 * derives the project from it, and answers "Session not found" for a session
 * that does not exist and for one belonging to another tenant alike. Nothing
 * about it needed changing, so nothing was changed.
 *
 * What it lacked was evidence. Four of these operations mutate a running
 * session — cancel, pause, resume, recover — so a caller who could reach
 * another tenant's session could stop work mid-flight. Each refusal is
 * therefore checked for its effect as well as its status: a denial that paused
 * the session anyway would satisfy a status assertion and be a denial of
 * service against another tenant's generation.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { AutonomousOrchestrator } from "../orchestrator/AutonomousOrchestrator";
import { createProjectRuntime } from "../routes/projects";
import { createAutonomousRouter } from "../routes/autonomous";

const OWNER = { token: "token-owner", userId: "user-owner" };
const INTRUDER = { token: "token-intruder", userId: "user-intruder" };

let server: Server | undefined;
let orchestrator: AutonomousOrchestrator | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
  orchestrator = undefined;
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
    "Runs the session",
    {},
  );
  const intruderProject = await runtime.projectRepository.createDurable(
    INTRUDER.userId,
    "Intruder project",
    "adventure",
    "The caller's own",
    {},
  );

  orchestrator = new AutonomousOrchestrator();

  const app = express();
  app.use(express.json());
  app.use(
    "/api/autonomous",
    createAutonomousRouter(undefined, runtime.access, orchestrator),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }

  return {
    base: `http://127.0.0.1:${address.port}/api/autonomous`,
    ownerProjectId: ownerProject.id,
    intruderProjectId: intruderProject.id,
  };
}

function send(base: string, path: string, token: string, method = "GET") {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });
}

async function read(response: globalThis.Response) {
  return { status: response.status, body: await response.json() };
}

/**
 * A persisted session belonging to the owner. Started through the orchestrator
 * rather than the route so the fixture does not depend on the very
 * authorization being tested.
 */
async function seedSession(projectId: string) {
  const session = await orchestrator!.run("build the owner's game", projectId);
  if (typeof session?.id !== "string") {
    throw new Error("Fixture could not start an autonomous session");
  }
  return session.id;
}

describe("MAR-001 autonomous session ownership", () => {
  it("answers identically for another tenant's session and a missing one", async () => {
    const { base, ownerProjectId } = await startTenants();
    const sessionId = await seedSession(ownerProjectId);

    for (const path of [`/status/${sessionId}`, `/capabilities/${sessionId}`]) {
      const foreign = await read(await send(base, path, INTRUDER.token));
      const missing = await read(
        await send(
          base,
          path.replace(sessionId, "no-such-session"),
          INTRUDER.token,
        ),
      );

      expect(foreign).toEqual(missing);
      expect(foreign.status).toBe(404);
    }
  });

  it("does not pause, resume, cancel or recover another tenant's session", async () => {
    const { base, ownerProjectId } = await startTenants();
    const sessionId = await seedSession(ownerProjectId);

    for (const action of ["pause", "resume", "cancel", "recover"]) {
      const refused = await read(
        await send(base, `/${action}/${sessionId}`, INTRUDER.token, "POST"),
      );
      expect(refused.status).toBe(404);
      expect(refused.body).toEqual({
        success: false,
        error: "Session not found",
      });
    }

    // The effect, not the status code. Comparing against a status captured
    // before the loop would race the orchestrator, which finishes the run on
    // its own; what matters is that the session never entered a state only
    // these four actions can produce. Stopping another tenant's generation
    // would be a denial of service that the assertions above would all miss.
    expect(["paused", "cancelled", "recovering"]).not.toContain(
      orchestrator?.getSession(sessionId)?.status,
    );
  });

  it("says nothing of the session it refuses", async () => {
    const { base, ownerProjectId } = await startTenants();
    const sessionId = await seedSession(ownerProjectId);

    const foreign = await read(
      await send(base, `/status/${sessionId}`, INTRUDER.token),
    );

    expect(JSON.stringify(foreign.body)).not.toContain(
      "build the owner's game",
    );
    expect(JSON.stringify(foreign.body)).not.toContain(ownerProjectId);
  });

  it("refuses to start a run in another tenant's project", async () => {
    const { base, ownerProjectId } = await startTenants();
    const beforeLatest =
      orchestrator?.getLatestSessionForProject(ownerProjectId)?.id;

    const refused = await fetch(`${base}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${INTRUDER.token}`,
      },
      body: JSON.stringify({
        projectId: ownerProjectId,
        goal: "run work the caller does not own",
      }),
    });

    expect(refused.status).toBeGreaterThanOrEqual(400);
    // Starting a run spends provider budget against a project the caller does
    // not own, so the refusal has to happen before anything is created.
    expect(orchestrator?.getLatestSessionForProject(ownerProjectId)?.id).toBe(
      beforeLatest,
    );
  });

  it("still lets the owner read their own session", async () => {
    const { base, ownerProjectId } = await startTenants();
    const sessionId = await seedSession(ownerProjectId);

    // Without this the refusals above would also hold if the routes were broken
    // for everyone.
    const owned = await read(
      await send(base, `/status/${sessionId}`, OWNER.token),
    );
    expect(owned.status).toBe(200);
  });

  it("scopes the project latest-session lookup to the caller", async () => {
    const { base, ownerProjectId } = await startTenants();
    await seedSession(ownerProjectId);

    const foreign = await read(
      await send(base, `/project/${ownerProjectId}/latest`, INTRUDER.token),
    );
    const owned = await read(
      await send(base, `/project/${ownerProjectId}/latest`, OWNER.token),
    );

    expect(foreign.status).toBe(404);
    expect(owned.status).toBe(200);
  });
});
