/**
 * MAR-001 — SEC-PROJECT-ACCESS-DISCLOSURE-001.
 *
 * The shared project access control answered 403 "Access denied" for a project
 * that existed and belonged to someone else, and 404 "Project not found" for
 * one that did not exist. Any authenticated caller could therefore enumerate
 * which project identifiers were real, using the control that every
 * project-scoped route depends on.
 *
 * This is the same disclosure closed twice in the Studio surface, one level
 * down. It is fixed here through the canonical helper rather than in place,
 * because the helper is what stops the next route inventing its own answer.
 *
 * The invariant the helper carries is not concealment but derivation: it takes
 * a resource id and a loader, and gets the project from what the loader
 * returned. There is no parameter for a caller-supplied project, so the
 * mismatch that produced SEC-STUDIO-PROTOCOL-BINDING-001 cannot be written.
 */

import express from "express";
import type { Response } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { createProjectRuntime } from "../routes/projects";
import {
  createResourceAuthorizer,
  denyAsAbsent,
} from "../routes/resourceAuthorization";

const OWNER = { token: "token-owner", userId: "user-owner" };
const OTHER = { token: "token-other", userId: "user-other" };

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
});

async function startTenants() {
  const storage = new InMemoryStorageProvider();
  const auth = {
    validateToken: async (token: string) => {
      if (token === OWNER.token) return { userId: OWNER.userId };
      if (token === OTHER.token) return { userId: OTHER.userId };
      return null;
    },
  };
  const runtime = createProjectRuntime(storage, auth as never);

  const ownerProject = await runtime.projectRepository.createDurable(
    OWNER.userId,
    "Owner project",
    "adventure",
    "Exists, and is not the caller's",
    {},
  );
  await runtime.projectRepository.createDurable(
    OTHER.userId,
    "Other project",
    "adventure",
    "The caller's own",
    {},
  );

  const app = express();
  app.use(express.json());
  // A route that does nothing but exercise the control under test, so the
  // assertions are about authorization rather than about any one feature.
  app.get("/probe/:projectId", async (req, res) => {
    if (
      !(await runtime.access.requireProjectAccess(
        req,
        res,
        req.params.projectId,
      ))
    ) {
      return;
    }
    res.json({ success: true, data: { reached: true } });
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }

  return {
    base: `http://127.0.0.1:${address.port}`,
    runtime,
    ownerProjectId: ownerProject.id,
  };
}

async function probe(base: string, projectId: string, token: string) {
  const response = await fetch(`${base}/probe/${projectId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json() };
}

describe("MAR-001 project existence is not disclosed", () => {
  it("answers identically for another tenant's project and one that does not exist", async () => {
    const { base, ownerProjectId } = await startTenants();

    const foreign = await probe(base, ownerProjectId, OTHER.token);
    const missing = await probe(
      base,
      "project-that-does-not-exist",
      OTHER.token,
    );

    // Before this slice these were 403 and 404, which is exactly how a caller
    // learned which project identifiers were real.
    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
  });

  it("says nothing about the project it refuses", async () => {
    const { base, ownerProjectId } = await startTenants();

    const foreign = await probe(base, ownerProjectId, OTHER.token);

    expect(JSON.stringify(foreign.body)).not.toContain("Owner project");
    expect(JSON.stringify(foreign.body)).not.toContain(OWNER.userId);
    expect(foreign.body).toEqual({
      success: false,
      error: "Project not found",
    });
  });

  it("still admits the owner", async () => {
    const { base, ownerProjectId } = await startTenants();

    // Without this the refusals above would also hold if the route were broken
    // for everyone.
    const owner = await probe(base, ownerProjectId, OWNER.token);
    expect(owner.status).toBe(200);
  });

  it("still answers 401 when nobody is authenticated", async () => {
    const { base, ownerProjectId } = await startTenants();

    // Concealment applies to resources, not to the absence of a caller. Turning
    // this into a 404 would tell an anonymous client that the route exists but
    // hide that it needed credentials.
    const anonymous = await fetch(`${base}/probe/${ownerProjectId}`);
    expect(anonymous.status).toBe(401);
  });
});

describe("MAR-001 requireOwned derives the project from the resource", () => {
  function fakeResponse() {
    const calls: { status?: number; body?: unknown } = {};
    const res = {
      headersSent: false,
      status(code: number) {
        calls.status = code;
        return res;
      },
      json(body: unknown) {
        calls.body = body;
        return res;
      },
    };
    return { res: res as unknown as Response, calls };
  }

  const request = {} as Parameters<
    ReturnType<typeof createResourceAuthorizer>
  >[0];

  it("authorizes the project the resource records, not one it is handed", async () => {
    const seen: string[] = [];
    const requireOwned = createResourceAuthorizer({
      hasProjectAccess: async (_req, projectId) => {
        seen.push(projectId);
        return projectId === "project-allowed";
      },
    } as never);
    const { res } = fakeResponse();

    const loaded = await requireOwned(request, res, {
      resource: "Command",
      id: "command-1",
      // The resource belongs to a project the caller cannot access.
      load: () => ({ id: "command-1", projectId: "project-forbidden" }),
      projectOf: (command) => command.projectId,
    });

    expect(loaded).toBeNull();
    // The check ran against the resource's own project. There is no parameter
    // through which "project-allowed" could have been offered instead.
    expect(seen).toEqual(["project-forbidden"]);
  });

  it("returns the resource when its project is the caller's", async () => {
    const requireOwned = createResourceAuthorizer({
      hasProjectAccess: async (_req, projectId) => projectId === "project-mine",
    } as never);
    const { res } = fakeResponse();

    const loaded = await requireOwned(request, res, {
      resource: "Command",
      id: "command-1",
      load: () => ({ id: "command-1", projectId: "project-mine" }),
      projectOf: (command) => command.projectId,
    });

    expect(loaded).toEqual({ id: "command-1", projectId: "project-mine" });
  });

  it("refuses a missing resource and a forbidden one with one answer", async () => {
    const requireOwned = createResourceAuthorizer({
      hasProjectAccess: async () => false,
    } as never);

    const missing = fakeResponse();
    await requireOwned(request, missing.res, {
      resource: "Command",
      id: "nope",
      load: () => null,
      projectOf: () => undefined,
    });

    const forbidden = fakeResponse();
    await requireOwned(request, forbidden.res, {
      resource: "Command",
      id: "command-1",
      load: () => ({ projectId: "project-theirs" }),
      projectOf: (command) => command.projectId,
    });

    expect(missing.calls).toEqual(forbidden.calls);
    expect(missing.calls.status).toBe(404);
  });

  it("refuses when the deployment has no concealing access control", async () => {
    const requireOwned = createResourceAuthorizer(undefined);
    const { res, calls } = fakeResponse();

    // Fail closed. Falling back to a control that answers differently for
    // absent and foreign resources would reintroduce the disclosure.
    const loaded = await requireOwned(request, res, {
      resource: "Command",
      id: "command-1",
      load: () => ({ projectId: "project-any" }),
      projectOf: (command) => command.projectId,
    });

    expect(loaded).toBeNull();
    expect(calls.status).toBe(404);
  });

  it("builds the refusal from the resource name, not the resource", () => {
    const { res, calls } = fakeResponse();

    denyAsAbsent(res, "Blueprint");

    expect(calls.body).toEqual({
      success: false,
      error: "Blueprint not found",
    });
  });
});
