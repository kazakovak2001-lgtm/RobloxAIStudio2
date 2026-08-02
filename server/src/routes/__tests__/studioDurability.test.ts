import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { DurableStorageError } from "../../platform/storage/StorageProvider";
import { createStudioRouter } from "../studio";
import type {
  StudioEvidenceStore,
  StudioOperationalEvidence,
} from "../../studio/v2/StudioEvidenceStore";
import { StudioRuntime } from "../../studio/v2/StudioRuntime";

class RejectingEvidenceStore implements StudioEvidenceStore {
  async ready(): Promise<void> {}

  async refresh(): Promise<void> {
    throw new DurableStorageError("database credentials leaked", "read");
  }

  getCommand(): StudioOperationalEvidence | null {
    return null;
  }

  getLatestByProject(): StudioOperationalEvidence | null {
    return null;
  }

  async saveTransition(): Promise<boolean> {
    return false;
  }
}

let server: Server | undefined;
let runtime: StudioRuntime | undefined;

afterEach(async () => {
  runtime?.stopTimeoutMonitor();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
  runtime = undefined;
});

describe("Studio durable HTTP acknowledgement", () => {
  it("maps durable command failures to a generic 503", async () => {
    runtime = new StudioRuntime({ evidence: new RejectingEvidenceStore() });
    const client = runtime.bridge.connect("1.0.0", "project-1");
    const access = {
      hasProjectAccess: async () => true,
      requireProjectAccess: async () => true,
    } as never;
    const app = express();
    app.use(express.json());
    app.use("/api/studio", createStudioRouter(runtime, access));
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP test server");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/studio/commands/command-1/acknowledge`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: client.clientId }),
      },
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: "Durable storage is temporarily unavailable",
    });
    expect(JSON.stringify(body)).not.toContain("credentials");

    const protocolMessage = {
      protocolVersion: "1.0.0",
      messageId: "message-durable-retry",
      sessionId: "session-1",
      type: "COMMAND_ACK",
      command: "acknowledge",
      timestamp: Date.now(),
      direction: "client_to_server",
      payload: { clientId: client.clientId, commandId: "command-1" },
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const protocolResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/studio/protocol/message`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(protocolMessage),
        },
      );
      expect(protocolResponse.status).toBe(503);
      expect(await protocolResponse.json()).toEqual({
        success: false,
        error: "Durable storage is temporarily unavailable",
      });
    }
  });
});
