import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type Request, type Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { DurableStorageError } from "../platform/storage";
import { AutonomousOrchestrator } from "../orchestrator";
import { AutonomousPhaseRegistry } from "../orchestrator/AutonomousPhaseRegistry";
import {
  createAutonomousRouter,
  handleAutonomousMutationError,
} from "./autonomous";
import type { ProjectAccessControl } from "./projects";

function createResponseSpy(): {
  response: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const status = vi.fn();
  const json = vi.fn();
  const response = { status, json } as unknown as Response;
  status.mockReturnValue(response);
  json.mockReturnValue(response);
  return { response, status, json };
}

async function withAutonomousServer<T>(
  access: ProjectAccessControl | undefined,
  callback: (baseUrl: string) => Promise<T>,
  orchestrator = new AutonomousOrchestrator(),
): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(
    "/autonomous",
    createAutonomousRouter(undefined, access, orchestrator),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    return await callback(`http://127.0.0.1:${port}/autonomous`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function deniedAccess(
  options: { concealed?: boolean } = {},
): ProjectAccessControl {
  return {
    getRequestUserId: async () => "other-user",
    requireAuthenticatedUser: async () => "other-user",
    requireProjectAccess: async (_req: Request, res: Response) => {
      res.status(403).end();
      return false;
    },
    hasProjectAccess: options.concealed ? async () => false : undefined,
  };
}

describe("autonomous lifecycle durable errors", () => {
  it("maps durable rejection to a generic 503 without leaking internals", () => {
    const { response, status, json } = createResponseSpy();

    handleAutonomousMutationError(
      new DurableStorageError("database password leaked here", "set"),
      response,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: "Durable storage is temporarily unavailable",
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain(
      "database password leaked here",
    );
  });

  it("maps unexpected failures to a generic 500", () => {
    const { response, status, json } = createResponseSpy();

    handleAutonomousMutationError(new Error("private stack detail"), response);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: "Autonomous lifecycle mutation failed",
    });
  });
});

describe("autonomous route access control", () => {
  it("stops a denied project request without exposing autonomous JSON", async () => {
    await withAutonomousServer(deniedAccess(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/project/secret/latest`);
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
    });
  });

  it("conceals existing sessions with the same 404 as unknown sessions", async () => {
    const orchestrator = new AutonomousOrchestrator(undefined, {
      phaseRegistry: new AutonomousPhaseRegistry([]),
    });
    const session = await orchestrator.run(
      "Build a concealed autonomous obby",
      "project-secret",
    );

    await withAutonomousServer(
      deniedAccess({ concealed: true }),
      async (baseUrl) => {
        const existing = await fetch(`${baseUrl}/status/${session.id}`);
        const unknown = await fetch(`${baseUrl}/status/unknown-session`);
        expect(existing.status).toBe(404);
        expect(unknown.status).toBe(404);
        expect(await existing.json()).toEqual({
          success: false,
          error: "Session not found",
        });
      },
      orchestrator,
    );
  });

  it("requires a valid project id when access control is configured", async () => {
    await withAutonomousServer(deniedAccess(), async (baseUrl) => {
      const omitted = await fetch(`${baseUrl}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Build a protected obby" }),
      });
      const malformed = await fetch(`${baseUrl}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "Build a protected obby",
          projectId: 42,
        }),
      });
      expect(omitted.status).toBe(400);
      expect(malformed.status).toBe(400);
    });
  });
});
