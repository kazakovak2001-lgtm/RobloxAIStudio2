/**
 * SEC-AUTHZ-1 / AUDIT-CROSS-TENANT-EVIDENCE-001 — behavioural cross-tenant proof.
 *
 * The authorization matrix records 206 operations. Before this harness, five of
 * them had evidence that issues a real foreign request; fifteen had evidence
 * that only asserts strings in handler source, which cannot show that a
 * cross-owner request is refused; the rest had none. That is the state this
 * closes, family by family, rather than by writing one bespoke test per route.
 *
 * Each row below declares how to build a request. The harness derives three
 * cases from it, which is the contract every project-scoped operation owes:
 *
 *   own resource      → not refused
 *   foreign resource  → 403, or 404 where the route conceals existence
 *   unknown resource  → 404
 *
 * This pass covers the `body-blueprint-project` family. Those routes take the
 * whole blueprint from the request body and pass `blueprint.id` to
 * `requireProjectAccess`, using a field named like a blueprint identifier as a
 * project identifier. There is no cross-tenant escape today, because the
 * identifier must still resolve to a project the caller can reach, and that is
 * exactly what these assertions pin so the naming confusion cannot quietly
 * become one.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { createProjectRuntime } from "../routes/projects";
import { createEconomyRouter } from "../routes/economy";
import { createWorldRouter } from "../routes/world";
import { createSimulationRouter } from "../routes/simulation";
import { createLifecycleRouter } from "../routes/lifecycle";
import { createGenerationV2Router } from "../routes/generation-v2";

const OWNER = "owner-alpha";
const OTHER = "owner-beta";
const OWNER_TOKEN = "token-alpha";
const OTHER_TOKEN = "token-beta";
const UNKNOWN_PROJECT = "project-that-does-not-exist";

/** A blueprint shaped just well enough to reach the authorization check. */
function blueprintBody(projectId: string): Record<string, unknown> {
  return {
    blueprint: {
      id: projectId,
      name: "Authorization fixture",
      npcs: [],
      world: { biomes: [] },
      economy: { currencies: [], sources: [], sinks: [] },
    },
    ticks: 1,
  };
}

interface AuthzCase {
  /** Matrix operation key, so a row can be traced back to the inventory. */
  operation: string;
  method: "POST";
  path: (projectId: string) => string;
  body: (projectId: string) => Record<string, unknown>;
}

const BODY_BLUEPRINT_FAMILY: AuthzCase[] = [
  {
    operation: "POST /analyze | server/src/routes/economy.ts",
    method: "POST",
    path: () => "/api/economy/analyze",
    body: blueprintBody,
  },
  {
    operation: "POST /simulate | server/src/routes/economy.ts",
    method: "POST",
    path: () => "/api/economy/simulate",
    body: blueprintBody,
  },
  {
    operation: "POST /simulate | server/src/routes/world.ts",
    method: "POST",
    path: () => "/api/world/simulate",
    body: blueprintBody,
  },
  {
    operation: "POST /game | server/src/routes/simulation.ts",
    method: "POST",
    path: () => "/api/simulation/game",
    body: blueprintBody,
  },
  {
    operation: "POST /run | server/src/routes/simulation.ts",
    method: "POST",
    path: () => "/api/simulation/run",
    body: blueprintBody,
  },
  {
    // Rejects a body without `patches` before it authorizes, so the fixture
    // has to satisfy input validation to reach the check under test.
    operation: "POST /patch | server/src/routes/lifecycle.ts",
    method: "POST",
    path: () => "/api/lifecycle/patch",
    body: (projectId) => ({ ...blueprintBody(projectId), patches: [] }),
  },
  {
    // Same ordering: `lua` and `assets` are required before authorization.
    operation: "POST /export | server/src/routes/generation-v2.ts",
    method: "POST",
    path: () => "/api/generation-v2/export",
    body: (projectId) => ({
      ...blueprintBody(projectId),
      lua: { scripts: [] },
      assets: { models: [] },
    }),
  },
  {
    operation: "POST /lua | server/src/routes/generation-v2.ts",
    method: "POST",
    path: () => "/api/generation-v2/lua",
    body: blueprintBody,
  },
];

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
});

async function harness() {
  const storage = new InMemoryStorageProvider();
  const auth = {
    validateToken: async (token: string) =>
      token === OWNER_TOKEN
        ? { userId: OWNER }
        : token === OTHER_TOKEN
          ? { userId: OTHER }
          : null,
  };
  const runtime = createProjectRuntime(storage, auth as never);
  const ownProject = await runtime.projectRepository.createDurable(
    OWNER,
    "Owned project",
    "adventure",
    "",
    {},
  );
  const foreignProject = await runtime.projectRepository.createDurable(
    OTHER,
    "Someone else's project",
    "adventure",
    "",
    {},
  );

  const app = express();
  app.use(express.json());
  app.use("/api/economy", createEconomyRouter(runtime.access));
  app.use("/api/world", createWorldRouter(runtime.access));
  app.use("/api/simulation", createSimulationRouter(runtime.access));
  app.use("/api/lifecycle", createLifecycleRouter(runtime.access));
  app.use(
    "/api/generation-v2",
    createGenerationV2Router(new AgentRegistry(), runtime.access),
  );

  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }
  const base = `http://127.0.0.1:${address.port}`;

  const send = (entry: AuthzCase, projectId: string, token: string) =>
    fetch(`${base}${entry.path(projectId)}`, {
      method: entry.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(entry.body(projectId)),
    });

  return { ownProject, foreignProject, send };
}

describe("SEC-AUTHZ-1 body-blueprint-project family", () => {
  it.each(BODY_BLUEPRINT_FAMILY)(
    "refuses a foreign project on $operation",
    async (entry) => {
      const h = await harness();

      const foreign = await h.send(entry, h.foreignProject.id, OWNER_TOKEN);
      // 403 when the route states the denial, 404 where it conceals existence.
      // Anything else means the caller reached another tenant's resource.
      expect([403, 404]).toContain(foreign.status);
    },
  );

  it.each(BODY_BLUEPRINT_FAMILY)(
    "answers 404 for an unknown project on $operation",
    async (entry) => {
      const h = await harness();

      const unknown = await h.send(entry, UNKNOWN_PROJECT, OWNER_TOKEN);
      expect(unknown.status).toBe(404);
    },
  );

  it.each(BODY_BLUEPRINT_FAMILY)(
    "does not refuse the owner on $operation",
    async (entry) => {
      const h = await harness();

      const owned = await h.send(entry, h.ownProject.id, OWNER_TOKEN);
      // The handler may still fail on the stub payload; what must not happen is
      // an authorization refusal for the caller's own project.
      expect([401, 403, 404]).not.toContain(owned.status);
    },
  );

  it("refuses an unauthenticated caller on every row", async () => {
    const h = await harness();

    for (const entry of BODY_BLUEPRINT_FAMILY) {
      const response = await fetch(
        `http://127.0.0.1:${(server?.address() as { port: number }).port}${entry.path(h.ownProject.id)}`,
        {
          method: entry.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(entry.body(h.ownProject.id)),
        },
      );
      expect(response.status, entry.operation).toBe(401);
    }
  });
});
