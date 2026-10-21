/**
 * SEC-MAR001-REMAINING-GAPS-001 (api/v1 plan routes).
 *
 * `/api/v1/plan/execute` and `GET /api/v1/plan/:id` already resolve the plan
 * and authorize the project it recorded (`requirePlanProjectAccess`, mirrors
 * `requireOwned`) rather than trusting a caller-supplied project id — the
 * finding's own notes call this "a second plan surface beside
 * routes/planning.ts, unexercised, and duplication is the reason it was
 * missed" by the authorization matrix. The code path was already correct;
 * what was missing was a real cross-tenant request proving it. This is that
 * request.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createV1Router } from "../api/v1/index";
import { ApiGateway } from "../api/gateway/ApiGateway";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { createProjectRuntime } from "../routes/projects";
import type { AgentRegistry } from "../agents/core/AgentRegistry";

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

function fakeAgentRegistry(): AgentRegistry {
  return {
    executeAgent: async () => ({ success: true, output: {} }),
  } as unknown as AgentRegistry;
}

async function startServer() {
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

  const app = express();
  app.use(express.json());
  // Schema validation is orthogonal to authorization and not what this test
  // is about; the plan endpoints are exercised directly.
  const gateway = new ApiGateway({ enableValidation: false });
  app.use(
    "/api/v1",
    createV1Router(fakeAgentRegistry(), gateway, runtime.access),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }
  return {
    base: `http://127.0.0.1:${address.port}`,
    ownerProjectId: ownerProject.id,
  };
}

async function asUser(
  base: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

describe("SEC-MAR001-REMAINING-GAPS-001 api/v1 plan cross-tenant denial", () => {
  it("refuses another tenant reading a plan by id", async () => {
    const { base, ownerProjectId } = await startServer();

    const created = await asUser(
      base,
      OWNER.token,
      "POST",
      "/api/v1/plan/create",
      {
        intent: "Build a small obby",
        projectId: ownerProjectId,
      },
    );
    expect(created.status).toBe(200);
    const planId = (created.body as { data: { planId: string } }).data.planId;

    const foreignRead = await asUser(
      base,
      OTHER.token,
      "GET",
      `/api/v1/plan/${planId}`,
    );
    expect(foreignRead.status).toBe(404);

    const ownerRead = await asUser(
      base,
      OWNER.token,
      "GET",
      `/api/v1/plan/${planId}`,
    );
    expect(ownerRead.status).toBe(200);
  });

  it("refuses another tenant executing a plan they do not own", async () => {
    const { base, ownerProjectId } = await startServer();

    const created = await asUser(
      base,
      OWNER.token,
      "POST",
      "/api/v1/plan/create",
      {
        intent: "Build a small obby",
        projectId: ownerProjectId,
      },
    );
    const planId = (created.body as { data: { planId: string } }).data.planId;

    const foreignExecute = await asUser(
      base,
      OTHER.token,
      "POST",
      "/api/v1/plan/execute",
      { planId },
    );
    expect(foreignExecute.status).toBe(404);
  });

  it("refuses a plan id that does not exist, indistinguishably from a foreign one", async () => {
    const { base } = await startServer();

    const missing = await asUser(
      base,
      OTHER.token,
      "GET",
      "/api/v1/plan/plan-that-does-not-exist",
    );
    expect(missing.status).toBe(404);
  });
});
