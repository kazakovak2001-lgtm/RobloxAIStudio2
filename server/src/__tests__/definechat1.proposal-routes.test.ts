/**
 * DEFINE-CHAT-1 route authorization for blueprint change proposals.
 *
 * The proposal endpoints read and mutate a project's design, so they owe the
 * same contract as every other project-scoped operation: the owner is served, a
 * foreign project is refused, and an unauthenticated caller is refused. This is
 * the evidence the authorization matrix records for them, rather than pointing
 * at the service-level tests, which never issue a request.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { GameGenerationService } from "../projects/services/game-generation.service";
import { ArtifactStore } from "../pipeline/v2";
import {
  PipelineEventEmitter,
  StreamingUpdateHandler,
} from "../socket/streaming";
import { createGameGenerationRouter } from "../routes/game-generation";
import { createProjectRuntime } from "../routes/projects";
import type { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import type { CreateBlueprintInput } from "../projects/types/blueprint";

const OWNER = "owner-alpha";
const OTHER = "owner-beta";
const OWNER_TOKEN = "token-alpha";

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
      token === OWNER_TOKEN ? { userId: OWNER } : null,
  };
  const runtime = createProjectRuntime(storage, auth as never);
  const own = await runtime.projectRepository.createDurable(
    OWNER,
    "Owned",
    "adventure",
    "A brief.",
    {},
  );
  const foreign = await runtime.projectRepository.createDurable(
    OTHER,
    "Someone else's",
    "adventure",
    "",
    {},
  );

  const service = new GameGenerationService(
    new InMemoryBlueprintRepository(storage),
    new BlueprintCache(),
    new StreamingUpdateHandler(new PipelineEventEmitter()),
    new PipelineEventEmitter(),
    undefined,
    new AgentRegistry(),
    new ArtifactStore(),
  );
  await service.createBlueprint(OWNER, own.id, {
    project_id: own.id,
    user_id: OWNER,
    name: "Owned blueprint",
    description: "A brief.",
    game_type: "adventure",
    genre: ["exploration"],
    difficulty: "medium",
    estimated_players: "solo",
    target_audience: "all ages",
  } as CreateBlueprintInput);

  const app = express();
  app.use(express.json());
  app.use(
    "/api/generation",
    createGameGenerationRouter(
      service,
      {
        activateProjectExecution: () => undefined,
      } as unknown as StudioIntegrationManager,
      runtime,
    ),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }
  const base = `http://127.0.0.1:${address.port}/api/generation`;

  const call = (
    method: "GET" | "POST",
    path: string,
    token?: string,
    body?: unknown,
  ) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
    });

  return { own, foreign, call, service };
}

describe("DEFINE-CHAT-1 proposal route authorization", () => {
  it("serves the owner", async () => {
    const h = await harness();

    const listed = await h.call(
      "GET",
      `/${h.own.id}/blueprint/proposals`,
      OWNER_TOKEN,
    );
    expect(listed.status).toBe(200);

    const created = await h.call(
      "POST",
      `/${h.own.id}/blueprint/proposals`,
      OWNER_TOKEN,
      { changes: { description: "A proposed change." } },
    );
    expect(created.status).toBe(200);
  });

  it("refuses a foreign project", async () => {
    const h = await harness();

    for (const [method, path] of [
      ["GET", `/${h.foreign.id}/blueprint/proposals`],
      ["POST", `/${h.foreign.id}/blueprint/proposals`],
    ] as const) {
      const response = await h.call(method, path, OWNER_TOKEN, {
        changes: { description: "x" },
      });
      expect([403, 404], `${method} ${path}`).toContain(response.status);
    }
  });

  it("refuses an unauthenticated caller", async () => {
    const h = await harness();

    const response = await h.call(
      "GET",
      `/${h.own.id}/blueprint/proposals`,
      undefined,
    );
    expect(response.status).toBe(401);
  });

  it("does not decide a proposal that belongs to another project", async () => {
    const h = await harness();
    const created = await h.call(
      "POST",
      `/${h.own.id}/blueprint/proposals`,
      OWNER_TOKEN,
      { changes: { description: "A proposed change." } },
    );
    const { data } = (await created.json()) as { data: { id: string } };

    // Reaching a proposal through a project the caller happens to own must not
    // decide a proposal that belongs elsewhere.
    const response = await h.call(
      "POST",
      `/${h.foreign.id}/blueprint/proposals/${data.id}/accept`,
      OWNER_TOKEN,
    );
    expect([403, 404]).toContain(response.status);
  });
});
