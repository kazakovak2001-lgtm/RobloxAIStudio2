import express, {
  type Request,
  type Response as ExpressResponse,
} from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authMiddleware,
  configureApiKeyStore,
} from "../../common/middleware/security";
import {
  ApiKeyStore,
  STUDIO_PROJECT_ACCESS_CAPABILITY,
} from "../../platform/security/ApiKeyStore";
import { InMemoryStorageProvider } from "../../platform/storage/StorageProvider";
import { StudioRuntime } from "../../studio/v2/StudioRuntime";
import { createProjectRuntime, createProjectsRouter } from "../projects";
import { createStudioRouter } from "../studio";

describe("Studio project-scoped API key access", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  let server: Server | undefined;
  let studioRuntime: StudioRuntime | undefined;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
  });

  afterEach(async () => {
    process.env.NODE_ENV = previousNodeEnv;
    studioRuntime?.stopTimeoutMonitor();
    server?.closeAllConnections();
    await new Promise<void>(
      (resolve) => server?.close(() => resolve()) ?? resolve(),
    );
    server = undefined;
    studioRuntime = undefined;
  });

  async function startServer() {
    const storage = new InMemoryStorageProvider();
    const keyStore = configureApiKeyStore(storage);
    const auth = {
      validateToken: async (token: string) =>
        token === "owner-token" ? { userId: "owner-id" } : null,
    };
    const projectRuntime = createProjectRuntime(storage, auth as never);
    const project = await projectRuntime.projectRepository.createDurable(
      "owner-id",
      "Studio project",
      "adventure",
      "Scoped Studio integration test",
      {},
    );
    studioRuntime = new StudioRuntime();

    const app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use("/api/projects", createProjectsRouter(projectRuntime));
    app.use(
      "/api/studio",
      createStudioRouter(studioRuntime, projectRuntime.access),
    );
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP test server");
    }

    return {
      keyStore,
      project,
      projectUrl: `http://127.0.0.1:${address.port}/api/projects/${project.id}`,
      url: `http://127.0.0.1:${address.port}/api/studio/connect`,
    };
  }

  async function connect(
    url: string,
    projectId: string,
    apiKey?: string,
  ): Promise<globalThis.Response> {
    return fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify({ studioVersion: "2024.1", projectId }),
    });
  }

  it("returns 403 when Studio project access control is unavailable", async () => {
    studioRuntime = new StudioRuntime();
    const app = express();
    app.use(express.json());
    app.use("/api/studio", createStudioRouter(studioRuntime));
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP test server");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/studio/connect`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioVersion: "2024.1",
          projectId: "project-without-access-control",
        }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Studio project access control is unavailable",
    });
  });
  it("returns 401 without a key and 403 for wrong capability or scope", async () => {
    const { keyStore, project, url } = await startServer();
    const wrongCapability = await keyStore.issueDurable(
      "rai_0000000000000015_15151515151515151515151515151515",
      {
        capabilities: ["project.read"],
        resourceScopes: [project.id],
      },
    );
    const wrongScope = await keyStore.issueDurable(
      "rai_0000000000000016_16161616161616161616161616161616",
      {
        capabilities: [STUDIO_PROJECT_ACCESS_CAPABILITY],
        resourceScopes: ["different-project"],
      },
    );

    expect((await connect(url, project.id)).status).toBe(401);
    expect((await connect(url, project.id, wrongCapability.key)).status).toBe(
      403,
    );
    expect((await connect(url, project.id, wrongScope.key)).status).toBe(403);
  });

  it("connects with the exact Studio capability and project scope", async () => {
    const { keyStore, project, projectUrl, url } = await startServer();
    const issued = await keyStore.issueDurable(
      "rai_0000000000000017_17171717171717171717171717171717",
      {
        capabilities: [STUDIO_PROJECT_ACCESS_CAPABILITY],
        resourceScopes: [project.id],
      },
    );

    const response = await connect(url, project.id, issued.key);
    const body = (await response.json()) as {
      success: boolean;
      data?: { clientId?: string };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.clientId).toEqual(expect.any(String));
    expect(
      studioRuntime?.bridge.getClient(body.data?.clientId ?? "")?.projectId,
    ).toBe(project.id);

    const generalProjectResponse = await fetch(projectUrl, {
      headers: { "x-api-key": issued.key },
    });
    expect(generalProjectResponse.status).toBe(403);
  });

  it("returns one 404 for stale command polling and keeps serving requests", async () => {
    const { keyStore, project, url } = await startServer();
    const issued = await keyStore.issueDurable(
      "rai_0000000000000018_18181818181818181818181818181818",
      {
        capabilities: [STUDIO_PROJECT_ACCESS_CAPABILITY],
        resourceScopes: [project.id],
      },
    );

    const staleResponse = await fetch(
      `${url.replace(/\/connect$/, "")}/commands?clientId=stale-client`,
      { headers: { "x-api-key": issued.key } },
    );

    expect(staleResponse.status).toBe(404);
    await expect(staleResponse.json()).resolves.toEqual({
      success: false,
      error: "Client not found",
    });

    const reconnectResponse = await connect(url, project.id, issued.key);
    expect(reconnectResponse.status).toBe(200);
  });

  it("keeps the browser owner access path unchanged", async () => {
    const storage = new InMemoryStorageProvider();
    const auth = {
      validateToken: async () => ({ userId: "owner-id" }),
    };
    const runtime = createProjectRuntime(storage, auth as never);
    const project = await runtime.projectRepository.createDurable(
      "owner-id",
      "Browser project",
      "adventure",
      "Owner access test",
      {},
    );
    const req = {
      user: { userId: "owner-id" },
      headers: {},
    } as unknown as Request;
    const res = {
      status: () => res,
      json: () => res,
    } as unknown as ExpressResponse;

    await expect(
      runtime.access.requireProjectAccess(req, res, project.id),
    ).resolves.toBe(true);
  });
});
