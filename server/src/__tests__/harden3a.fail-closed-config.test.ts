import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Server as SocketServer } from "socket.io";
import { resolveStorageProviderType } from "../platform/storage/StorageFactory";
import {
  createProjectJoinAuthorizer,
  resolveSocketAuthMode,
} from "../socket/socketAuthPolicy";
import { RealtimeServer } from "../socket/index";

const env = (values: Record<string, string>) =>
  values as unknown as NodeJS.ProcessEnv;

describe("F6 STORAGE_PROVIDER resolution is fail-closed", () => {
  it("keeps the historical inmemory default when unset outside production", () => {
    expect(resolveStorageProviderType(env({}))).toBe("inmemory");
    expect(resolveStorageProviderType(env({ NODE_ENV: "development" }))).toBe(
      "inmemory",
    );
  });

  it("accepts the recognized values", () => {
    expect(
      resolveStorageProviderType(env({ STORAGE_PROVIDER: "postgres" })),
    ).toBe("postgres");
    expect(
      resolveStorageProviderType(env({ STORAGE_PROVIDER: "inmemory" })),
    ).toBe("inmemory");
  });

  it.each(["Postgres", "postgresql", "memory", "", " postgres"])(
    "throws on unrecognized value %j instead of degrading to inmemory",
    (value) => {
      expect(() =>
        resolveStorageProviderType(env({ STORAGE_PROVIDER: value })),
      ).toThrow(/Unrecognized STORAGE_PROVIDER/);
    },
  );

  it("refuses inmemory in production, whether explicit or defaulted", () => {
    expect(() =>
      resolveStorageProviderType(env({ NODE_ENV: "production" })),
    ).toThrow(/not durable/);
    expect(() =>
      resolveStorageProviderType(
        env({ NODE_ENV: "production", STORAGE_PROVIDER: "inmemory" }),
      ),
    ).toThrow(/not durable/);
    expect(
      resolveStorageProviderType(
        env({ NODE_ENV: "production", STORAGE_PROVIDER: "postgres" }),
      ),
    ).toBe("postgres");
  });

  it("allows production inmemory only with the exact explicit opt-in", () => {
    expect(
      resolveStorageProviderType(
        env({
          NODE_ENV: "production",
          STORAGE_PROVIDER: "inmemory",
          ALLOW_INMEMORY_STORAGE_IN_PRODUCTION: "true",
        }),
      ),
    ).toBe("inmemory");
    expect(() =>
      resolveStorageProviderType(
        env({
          NODE_ENV: "production",
          STORAGE_PROVIDER: "inmemory",
          ALLOW_INMEMORY_STORAGE_IN_PRODUCTION: "yes",
        }),
      ),
    ).toThrow(/not durable/);
  });
});

describe("F7 release compose requires an LLM provider", () => {
  const root = resolve(__dirname, "../../..");
  const backendBlock = (file: string) => {
    const content = readFileSync(resolve(root, file), "utf8");
    const backend = content.split(/\r?\n  backend:\r?\n/)[1] ?? "";
    return backend.split(/\r?\n  [a-z]+:\r?\n/)[0];
  };

  it("backend compose pins REQUIRE_LLM_PROVIDER to true", () => {
    expect(backendBlock("deploy/docker-compose.backend.yml")).toMatch(
      /^ {6}REQUIRE_LLM_PROVIDER: "true"\r?$/m,
    );
  });

  it("release compose defaults REQUIRE_LLM_PROVIDER to true", () => {
    expect(backendBlock("deploy/docker-compose.release.yml")).toMatch(
      /^ {6}REQUIRE_LLM_PROVIDER: \$\{REQUIRE_LLM_PROVIDER:-true\}\r?$/m,
    );
  });
});

describe("F8 Socket.IO auth mode", () => {
  it("requires authentication by default in every environment", () => {
    expect(resolveSocketAuthMode(env({}))).toBe("required");
    expect(resolveSocketAuthMode(env({ NODE_ENV: "development" }))).toBe(
      "required",
    );
    expect(resolveSocketAuthMode(env({ NODE_ENV: "test" }))).toBe("required");
    expect(
      resolveSocketAuthMode(env({ SOCKET_AUTH_DEV_BYPASS: "false" })),
    ).toBe("required");
  });

  it("enables the bypass only on explicit opt-in outside production", () => {
    expect(
      resolveSocketAuthMode(
        env({ NODE_ENV: "development", SOCKET_AUTH_DEV_BYPASS: "true" }),
      ),
    ).toBe("dev-bypass");
  });

  it("refuses the bypass with NODE_ENV=production", () => {
    expect(() =>
      resolveSocketAuthMode(
        env({ NODE_ENV: "production", SOCKET_AUTH_DEV_BYPASS: "true" }),
      ),
    ).toThrow(/not allowed with NODE_ENV=production/);
  });

  it("throws on an unrecognized bypass value", () => {
    expect(() =>
      resolveSocketAuthMode(env({ SOCKET_AUTH_DEV_BYPASS: "1" })),
    ).toThrow(/Unrecognized SOCKET_AUTH_DEV_BYPASS/);
  });
});

// Minimal Socket.IO doubles: enough surface for RealtimeServer's handlers.
class FakeSocket extends EventEmitter {
  joined = new Set<string>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  handshake = { query: {} as Record<string, string> };
  constructor(
    public id: string,
    public data: { user?: { userId?: string } },
  ) {
    super();
  }
  override emit(event: string, payload?: unknown): boolean {
    this.emitted.push({ event, payload });
    return true;
  }
  fire(event: string, payload: unknown) {
    return super.emit(event, payload);
  }
  join(room: string) {
    this.joined.add(room);
  }
  leave(room: string) {
    this.joined.delete(room);
  }
  to() {
    return { emit: () => true };
  }
}

function connect(io: EventEmitter, socket: FakeSocket) {
  io.emit("connection", socket);
  return socket;
}

describe("F8 project room joins across two projects", () => {
  const PROJECT_A = "proj-alpha";
  const PROJECT_B = "proj-bravo";
  const owners: Record<string, string> = {
    [PROJECT_A]: "user-a",
    [PROJECT_B]: "user-b",
  };
  const verifyOwnership = (projectId: string, userId: string) =>
    owners[projectId] === userId;

  function setup(mode: "required" | "dev-bypass") {
    const io = new EventEmitter();
    new RealtimeServer(
      io as unknown as SocketServer,
      createProjectJoinAuthorizer(mode, verifyOwnership),
    );
    return io;
  }

  it("lets an authenticated user join only the project they own", () => {
    const io = setup("required");
    const socket = connect(
      io,
      new FakeSocket("s-a", { user: { userId: "user-a" } }),
    );

    socket.fire("project:join", { projectId: PROJECT_A });
    socket.fire("project:join", { projectId: PROJECT_B });

    expect(socket.joined.has(`project:${PROJECT_A}`)).toBe(true);
    expect(socket.joined.has(`project:${PROJECT_B}`)).toBe(false);
    expect(socket.emitted).toContainEqual({
      event: "project:error",
      payload: { projectId: PROJECT_B, error: "Project access denied" },
    });
  });

  it("denies a socket without a userId when auth is required", () => {
    const io = setup("required");
    const socket = connect(io, new FakeSocket("s-anon", {}));
    // A client-supplied userId in the handshake query must not authorize.
    socket.handshake.query.userId = "user-a";

    socket.fire("project:join", { projectId: PROJECT_A });
    socket.fire("project:join", { projectId: PROJECT_B });

    expect(socket.joined.size).toBe(0);
  });

  it("admits a userId-less socket only under the explicit dev bypass", () => {
    const io = setup("dev-bypass");
    const socket = connect(io, new FakeSocket("s-dev", {}));

    socket.fire("project:join", { projectId: PROJECT_A });

    expect(socket.joined.has(`project:${PROJECT_A}`)).toBe(true);
  });

  it("still enforces ownership for authenticated users under the bypass", () => {
    const io = setup("dev-bypass");
    const socket = connect(
      io,
      new FakeSocket("s-b", { user: { userId: "user-b" } }),
    );

    socket.fire("project:join", { projectId: PROJECT_A });

    expect(socket.joined.size).toBe(0);
  });
});
