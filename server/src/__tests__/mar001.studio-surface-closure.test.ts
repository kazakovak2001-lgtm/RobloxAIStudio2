/**
 * MAR-001 — behavioural closure of the remaining Studio operations.
 *
 * The other two MAR-001 files each pin a defect that was found and fixed. This
 * one covers the rest of the Studio surface, where the binding turned out to be
 * sound, and replaces the source-text assertions that stood in for evidence.
 *
 * A verified binding with no executed cross-tenant request is a claim, not a
 * proof, which is the distinction the authorization matrix draws between
 * `static-source-only` and a named test file. Each operation is therefore
 * exercised with a real request from a real second tenant, and every mutating
 * one is checked for the side effect as well as the status code: a refusal that
 * still disconnected the victim's client would satisfy a status assertion and
 * be a denial of service.
 *
 * One finding is deliberately not asserted here. The shared project access
 * control answers 404 for a project that does not exist and 403 for one that
 * exists and belongs to someone else, so a caller can still distinguish the
 * two. That is the same disclosure closed for Studio commands, one level down,
 * and it is recorded as SEC-PROJECT-ACCESS-DISCLOSURE-001 rather than fixed
 * here, because changing the shared control is the canonical helper's job and
 * not another route repair.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { StudioRuntime } from "../studio/v2/StudioRuntime";
import { createProjectRuntime } from "../routes/projects";
import { createStudioRouter } from "../routes/studio";

const OWNER = { token: "token-owner", userId: "user-owner" };
const INTRUDER = { token: "token-intruder", userId: "user-intruder" };

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

function get(base: string, path: string, token: string) {
  return fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function post(base: string, path: string, token: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
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
    "Holds the client, the session and the artifacts",
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
  const executionId = "execution-mar001-closure";
  runtime.artifacts.store(
    executionId,
    "LUA_GENERATION",
    "lua_generator",
    {
      scripts: [
        {
          path: "ServerScriptService/Secret.server.lua",
          content: "-- owner-only source",
        },
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
  await runtime.queueProjectExport(
    ownerClient.clientId,
    ownerProject.id,
    executionId,
  );

  const intruderClient = runtime.bridge.connect("0.650", intruderProject.id);
  runtime.sessions.create(intruderClient);

  const ownerArtifactIds = runtime.artifacts
    .getByPipeline(executionId)
    .map((artifact) => artifact.id);
  if (ownerArtifactIds.length === 0) {
    throw new Error("Fixture stored no artifacts to attempt stealing");
  }

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
    ownerProjectId: ownerProject.id,
    ownerClientId: ownerClient.clientId,
    ownerArtifactIds,
    intruderProjectId: intruderProject.id,
    intruderClientId: intruderClient.clientId,
  };
}

describe("MAR-001 Studio client-scoped reads", () => {
  it("refuses another tenant's client on every client-scoped read", async () => {
    const { base, ownerClientId } = await startTenants();

    for (const path of [
      `/commands?clientId=${ownerClientId}`,
      `/session?clientId=${ownerClientId}`,
      `/protocol/log?clientId=${ownerClientId}`,
    ]) {
      const response = await get(base, path, INTRUDER.token);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: "Client not found",
      });
    }
  });

  it("lists only the caller's own clients, sessions and events", async () => {
    const { base, ownerClientId, intruderClientId } = await startTenants();

    for (const path of ["/status", "/session", "/events"]) {
      const body = await (await get(base, path, INTRUDER.token)).text();
      expect(body).not.toContain(ownerClientId);
      // The caller's own identity must still be there, or the assertion above
      // would pass on an empty response for the wrong reason.
      if (path !== "/events") expect(body).toContain(intruderClientId);
    }
  });
});

describe("MAR-001 Studio client-scoped mutations", () => {
  it("does not disconnect another tenant's client", async () => {
    const { base, ownerClientId } = await startTenants();

    const response = await post(base, "/disconnect", INTRUDER.token, {
      clientId: ownerClientId,
    });

    expect(response.status).toBe(404);
    // The side effect is the point. A refusal that disconnected the client
    // anyway would pass a status assertion and be a denial of service.
    expect(runtime?.bridge.getClient(ownerClientId)?.status).toBe("connected");
  });

  it("does not record activity on another tenant's client", async () => {
    const { base, ownerClientId } = await startTenants();
    const before = runtime?.bridge.getClient(ownerClientId)?.lastHeartbeat;

    const response = await post(base, "/heartbeat", INTRUDER.token, {
      clientId: ownerClientId,
    });

    expect(response.status).toBe(404);
    expect(runtime?.bridge.getClient(ownerClientId)?.lastHeartbeat).toBe(
      before,
    );
  });
});

describe("MAR-001 Studio project-scoped operations", () => {
  it("refuses another tenant's project on every project-scoped operation", async () => {
    const { base, ownerProjectId, ownerArtifactIds } = await startTenants();

    const attempts = [
      () =>
        get(base, `/sync/status?projectId=${ownerProjectId}`, INTRUDER.token),
      () =>
        post(base, "/sync/project", INTRUDER.token, {
          projectId: ownerProjectId,
        }),
      () =>
        post(base, "/sync/artifacts", INTRUDER.token, {
          projectId: ownerProjectId,
          artifactIds: ownerArtifactIds,
        }),
      () =>
        post(base, "/connect", INTRUDER.token, {
          studioVersion: "2024.1",
          projectId: ownerProjectId,
        }),
      () =>
        post(base, "/protocol/register", INTRUDER.token, {
          pluginVersion: "1.0.0",
          studioVersion: "2024.1",
          protocolVersion: "1.0.0",
          projectId: ownerProjectId,
        }),
    ];

    for (const attempt of attempts) {
      const response = await attempt();
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await response.text()).not.toContain("owner-only source");
    }
  });

  it("does not connect a client into another tenant's project", async () => {
    const { base, ownerProjectId } = await startTenants();
    const before = runtime?.bridge.getConnectedClients().length ?? 0;

    await post(base, "/connect", INTRUDER.token, {
      studioVersion: "2024.1",
      projectId: ownerProjectId,
    });

    expect(runtime?.bridge.getConnectedClients().length).toBe(before);
  });

  it("does not hand over artifacts named under a project the caller does own", async () => {
    const { base, intruderProjectId, ownerArtifactIds } = await startTenants();

    // Authorization succeeds here: the caller owns the project they named. The
    // question is whether the artifact ids beside it are checked against it.
    const response = await post(base, "/sync/artifacts", INTRUDER.token, {
      projectId: intruderProjectId,
      artifactIds: ownerArtifactIds,
    });

    const text = await response.text();
    expect(text).not.toContain("owner-only source");
    expect(text).not.toContain("Secret.server.lua");
  });
});

describe("MAR-001 Studio positive controls", () => {
  it("serves the owner everything the intruder was refused", async () => {
    const { base, ownerProjectId, ownerClientId, ownerArtifactIds } =
      await startTenants();

    // Every refusal above is only meaningful if the same request succeeds for
    // the tenant who owns the resource. Without this, a route that was broken
    // for everyone would look perfectly secured.
    for (const path of [
      `/commands?clientId=${ownerClientId}`,
      `/session?clientId=${ownerClientId}`,
      `/sync/status?projectId=${ownerProjectId}`,
    ]) {
      expect((await get(base, path, OWNER.token)).status).toBe(200);
    }

    const snapshot = await post(base, "/sync/project", OWNER.token, {
      projectId: ownerProjectId,
    });
    expect(snapshot.status).toBe(200);

    const artifacts = await post(base, "/sync/artifacts", OWNER.token, {
      projectId: ownerProjectId,
      artifactIds: ownerArtifactIds,
    });
    expect(artifacts.status).toBe(200);
    // The content the intruder must not see is content that really is
    // retrievable, rather than a string that never appears in any response.
    expect(await artifacts.text()).toContain("owner-only source");
  });
});

describe("MAR-001 Studio unauthenticated surface", () => {
  it("exposes only static protocol metadata without a caller", async () => {
    const { base, ownerClientId, ownerProjectId } = await startTenants();

    const body = await (await fetch(`${base}/protocol/info`)).text();

    // This route is deliberately open. What matters is that it stays static:
    // no identities, no counts, nothing derived from live state.
    expect(body).not.toContain(ownerClientId);
    expect(body).not.toContain(ownerProjectId);
    expect(body).toContain("protocolVersion");
  });
});
