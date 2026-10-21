/**
 * MAR-001 — concept and v1 plan ownership, by executed cross-tenant request.
 *
 * The authorization matrix carried `GET /concept/:id`, `POST
 * /concept/experience/generate`, `GET /api/v1/plan/:id` and `POST
 * /api/v1/plan/execute` as `indirect-unreviewed` mechanism gaps. Reading the
 * handlers shows each resolves the resource and checks its owner before doing
 * anything with it; these tests pin that by request rather than by reading.
 *
 * Each refusal is checked for its effect, not only its status: the intruder
 * receives none of the owner's data, the answer is indistinguishable from an
 * id that does not exist, and no agent runs on the owner's resource.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ApiGateway } from "../api/gateway/ApiGateway";
import { createV1Router } from "../api/v1";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { StorageGenerationHistoryRepository } from "../projects/repository/generationHistory.repository";
import { createConceptRouter } from "../routes/concept";
import { createProjectRuntime } from "../routes/projects";

const OWNER = { token: "token-owner", userId: "user-owner" };
const INTRUDER = { token: "token-intruder", userId: "user-intruder" };

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
      if (token === INTRUDER.token) return { userId: INTRUDER.userId };
      return null;
    },
  };
  const runtime = createProjectRuntime(storage, auth as never);
  const ownerProject = await runtime.projectRepository.createDurable(
    OWNER.userId,
    "Owner project",
    "adventure",
    "Holds the plan",
    {},
  );
  const intruderProject = await runtime.projectRepository.createDurable(
    INTRUDER.userId,
    "Intruder project",
    "adventure",
    "The caller's own",
    {},
  );

  const registry = new AgentRegistry();
  const agentCalls: string[] = [];
  const executeAgent = registry.executeAgent.bind(registry);
  registry.executeAgent = (async (agentType: string, input: never) => {
    agentCalls.push(agentType);
    return executeAgent(agentType, input);
  }) as typeof registry.executeAgent;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/concept",
    createConceptRouter(
      registry,
      new StorageGenerationHistoryRepository(storage),
      runtime.access,
    ),
  );
  app.use(
    "/api/v1",
    createV1Router(
      registry,
      new ApiGateway({ version: "1.0.0" }),
      runtime.access,
    ),
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
    intruderProjectId: intruderProject.id,
    agentCalls,
  };
}

async function call(
  base: string,
  method: "GET" | "POST",
  path: string,
  token: string | null,
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, text };
}

/**
 * v1 error bodies name the id they refused and carry per-request trace
 * metadata; compare them with the id redacted and the metadata dropped.
 */
function redact(text: string, ...ids: string[]) {
  const body = JSON.parse(
    ids.reduce((acc, id) => acc.split(id).join("<id>"), text),
  ) as Record<string, unknown>;
  delete body.meta;
  return body;
}

describe("MAR-001 concept ownership", () => {
  async function ownerConcept() {
    const tenants = await startTenants();
    const created = await call(
      tenants.base,
      "POST",
      "/api/concept/generate",
      OWNER.token,
      { gameDescription: "A private castle defence concept", genre: "rpg" },
    );
    expect(created.status).toBe(200);
    const conceptId = JSON.parse(created.text).data.conceptId as string;
    return { ...tenants, conceptId };
  }

  it("lets the owner read the concept and refuses another tenant as if it did not exist", async () => {
    const { base, conceptId } = await ownerConcept();

    const own = await call(
      base,
      "GET",
      `/api/concept/${conceptId}`,
      OWNER.token,
    );
    expect(own.status).toBe(200);
    expect(own.text).toContain("A private castle defence concept");

    const foreign = await call(
      base,
      "GET",
      `/api/concept/${conceptId}`,
      INTRUDER.token,
    );
    const absent = await call(
      base,
      "GET",
      "/api/concept/concept-doesnotexist",
      INTRUDER.token,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.text).not.toContain("castle");
    expect(foreign).toEqual(absent);
  });

  it("does not run the pipeline for another tenant's concept named in the body", async () => {
    const { base, conceptId, agentCalls } = await ownerConcept();

    const foreign = await call(
      base,
      "POST",
      "/api/concept/experience/generate",
      INTRUDER.token,
      { conceptId },
    );
    const absent = await call(
      base,
      "POST",
      "/api/concept/experience/generate",
      INTRUDER.token,
      { conceptId: "concept-doesnotexist" },
    );
    expect(foreign.status).toBe(404);
    expect(foreign).toEqual(absent);
    expect(agentCalls).toEqual([]);
  });

  it("refuses an unauthenticated read of an existing concept", async () => {
    const { base, conceptId } = await ownerConcept();
    const anonymous = await call(
      base,
      "GET",
      `/api/concept/${conceptId}`,
      null,
    );
    expect(anonymous.status).toBe(401);
    expect(anonymous.text).not.toContain("castle");
  });
});

describe("MAR-001 v1 plan ownership", () => {
  async function ownerPlan() {
    const tenants = await startTenants();
    const created = await call(
      tenants.base,
      "POST",
      "/api/v1/plan/create",
      OWNER.token,
      { projectId: tenants.ownerProjectId, intent: "A private tower plan" },
    );
    expect(created.status).toBe(200);
    const planId = JSON.parse(created.text).data.planId as string;
    return { ...tenants, planId };
  }

  it("refuses to create a plan in another tenant's project", async () => {
    const { base, ownerProjectId } = await startTenants();
    const foreign = await call(
      base,
      "POST",
      "/api/v1/plan/create",
      INTRUDER.token,
      {
        projectId: ownerProjectId,
        intent: "planted in someone else's project",
      },
    );
    expect(foreign.status).toBe(404);
  });

  it("lets the owner read the plan and refuses another tenant as if it did not exist", async () => {
    const { base, planId } = await ownerPlan();

    const own = await call(base, "GET", `/api/v1/plan/${planId}`, OWNER.token);
    expect(own.status).toBe(200);
    expect(own.text).toContain("A private tower plan");

    const foreign = await call(
      base,
      "GET",
      `/api/v1/plan/${planId}`,
      INTRUDER.token,
    );
    const absent = await call(
      base,
      "GET",
      "/api/v1/plan/plan-doesnotexist",
      INTRUDER.token,
    );
    expect(foreign.text).not.toContain("tower");
    expect(foreign.status).toBe(absent.status);
    expect(redact(foreign.text, planId)).toEqual(
      redact(absent.text, "plan-doesnotexist"),
    );
  });

  it("does not execute another tenant's plan named in the body", async () => {
    const { base, planId, agentCalls } = await ownerPlan();

    const foreign = await call(
      base,
      "POST",
      "/api/v1/plan/execute",
      INTRUDER.token,
      { planId, options: { maxRetries: 3 } },
    );
    const absent = await call(
      base,
      "POST",
      "/api/v1/plan/execute",
      INTRUDER.token,
      { planId: "plan-doesnotexist" },
    );
    expect(foreign.status).toBe(absent.status);
    expect(redact(foreign.text, planId)).toEqual(
      redact(absent.text, "plan-doesnotexist"),
    );
    expect(agentCalls).toEqual([]);
  });
});
