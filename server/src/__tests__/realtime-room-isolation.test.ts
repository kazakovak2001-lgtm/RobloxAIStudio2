/**
 * REALTIME-ROOM-ISOLATION-1 — a socket must belong to at most one project
 * room at a time.
 *
 * `project:join` overwrote `player.projectId` and joined the new project's
 * room without ever leaving the previous one: the socket stayed subscribed
 * to project A's room while application state (`player.projectId`) claimed
 * only project B. A socket could therefore keep receiving project A events
 * after "switching" to project B, and `projectRooms` accumulated stale
 * membership for a project no player object still pointed at.
 *
 * These tests drive real Socket.IO connections through `RealtimeServer` and
 * assert observed room membership/events, not source text.
 */

import { createServer, type Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { RealtimeServer } from "../socket/index";

const PROJECT_A = "project-alpha";
const PROJECT_B = "project-beta";

interface Harness {
  server: RealtimeServer;
  url: string;
  connect: (userId: string) => Promise<ClientSocket>;
  close: () => Promise<void>;
}

let active: Harness | undefined;

afterEach(async () => {
  await active?.close();
  active = undefined;
});

/** user -> set of projects that user may join. */
function authorizer(grants: Record<string, string[]>) {
  return (projectId: string, userId?: string): boolean => {
    if (!userId) return false;
    return grants[userId]?.includes(projectId) ?? false;
  };
}

async function harness(grants: Record<string, string[]>): Promise<Harness> {
  const httpServer: HttpServer = createServer();
  const io = new SocketServer(httpServer);
  io.use((socket, next) => {
    const userId = socket.handshake.query.userId as string | undefined;
    (socket.data as { user?: { userId?: string } }).user = userId
      ? { userId }
      : undefined;
    next();
  });
  const server = new RealtimeServer(io, authorizer(grants));

  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }
  const url = `http://127.0.0.1:${address.port}`;

  const clients: ClientSocket[] = [];
  const built: Harness = {
    server,
    url,
    connect: (userId: string) =>
      new Promise<ClientSocket>((resolve) => {
        const socket = connect(url, {
          transports: ["websocket"],
          query: { userId },
        });
        clients.push(socket);
        socket.once("connect", () => resolve(socket));
      }),
    close: async () => {
      for (const socket of clients) socket.close();
      io.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
  active = built;
  return built;
}

function joinResult(
  socket: ClientSocket,
  projectId: string,
): Promise<"joined" | "error"> {
  return new Promise((resolve) => {
    socket.once("project:joined", () => resolve("joined"));
    socket.once("project:error", () => resolve("error"));
    socket.emit("project:join", { projectId });
  });
}

function leaveResult(
  socket: ClientSocket,
  projectId: string,
): Promise<"left" | "error" | "none"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("none"), 150);
    socket.once("project:error", () => {
      clearTimeout(timer);
      resolve("error");
    });
    socket.emit("project:leave", { projectId });
    setTimeout(() => {
      clearTimeout(timer);
      resolve("left");
    }, 50);
  });
}

function record(socket: ClientSocket, eventName: string, into: unknown[]) {
  socket.on(eventName, (payload: unknown) => into.push(payload));
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
}

describe("REALTIME-ROOM-ISOLATION-1", () => {
  it("leaves project A and stops receiving its events after switching to project B", async () => {
    const h = await harness({
      alice: [PROJECT_A, PROJECT_B],
      "observer-a": [PROJECT_A],
      third: [PROJECT_A],
    });
    const alice = await h.connect("alice");
    const observer = await h.connect("observer-a");
    // observer joins A first so we can prove alice no longer receives A broadcasts.
    expect(await joinResult(observer, PROJECT_A)).toBe("joined");
    await joinResult(alice, PROJECT_A);

    const aliceEvents: unknown[] = [];
    record(alice, "player:joined", aliceEvents);
    record(alice, "player:left", aliceEvents);

    expect(await joinResult(alice, PROJECT_B)).toBe("joined");
    await settle();

    expect(h.server.getProjectRoom(PROJECT_A).has(alice.id!)).toBe(false);
    expect(h.server.getProjectRoom(PROJECT_B).has(alice.id!)).toBe(true);

    // A third party joining A afterwards must not reach alice: she is gone from A's room.
    const third = await h.connect("third");
    expect(await joinResult(third, PROJECT_A)).toBe("joined");
    await settle();
    expect(aliceEvents).toEqual([]);
  });

  it("emits player:left to A exactly once and player:joined to B exactly once on switch", async () => {
    const h = await harness({
      alice: [PROJECT_A, PROJECT_B],
      "watcher-a": [PROJECT_A],
      "watcher-b": [PROJECT_B],
    });
    const alice = await h.connect("alice");
    const watcherA = await h.connect("watcher-a");
    const watcherB = await h.connect("watcher-b");
    await joinResult(watcherA, PROJECT_A);
    await joinResult(watcherB, PROJECT_B);
    await joinResult(alice, PROJECT_A);

    const leftAtA: unknown[] = [];
    const joinedAtB: unknown[] = [];
    record(watcherA, "player:left", leftAtA);
    record(watcherB, "player:joined", joinedAtB);

    expect(await joinResult(alice, PROJECT_B)).toBe("joined");
    await settle();

    expect(leftAtA).toHaveLength(1);
    expect(joinedAtB).toHaveLength(1);
  });

  it("leaves project A membership and state untouched when the B join is denied", async () => {
    const h = await harness({ alice: [PROJECT_A] });
    const alice = await h.connect("alice");
    await joinResult(alice, PROJECT_A);

    const watcherA = await h.connect("watcher-a");
    await joinResult(watcherA, PROJECT_A);
    const leftAtA: unknown[] = [];
    record(watcherA, "player:left", leftAtA);

    expect(await joinResult(alice, PROJECT_B)).toBe("error");
    await settle();

    expect(h.server.getProjectRoom(PROJECT_A).has(alice.id!)).toBe(true);
    expect(h.server.getProjectRoom(PROJECT_B).has(alice.id!)).toBe(false);
    expect(leftAtA).toEqual([]);
  });

  it("project:leave only affects the socket's current authorized project", async () => {
    const h = await harness({ alice: [PROJECT_A, PROJECT_B] });
    const alice = await h.connect("alice");
    await joinResult(alice, PROJECT_A);

    // Leaving a project the socket is not currently in must be refused, not mutate state.
    expect(await leaveResult(alice, PROJECT_B)).toBe("error");
    expect(h.server.getProjectRoom(PROJECT_A).has(alice.id!)).toBe(true);

    expect(await leaveResult(alice, PROJECT_A)).toBe("left");
    expect(h.server.getProjectRoom(PROJECT_A).has(alice.id!)).toBe(false);
  });

  it("cleans the current room on disconnect with no stale projectRooms entries", async () => {
    const h = await harness({ alice: [PROJECT_A] });
    const alice = await h.connect("alice");
    await joinResult(alice, PROJECT_A);
    expect(h.server.getProjectRoom(PROJECT_A).has(alice.id!)).toBe(true);

    alice.close();
    await settle();

    expect(h.server.getProjectRoom(PROJECT_A).has(alice.id!)).toBe(false);
    expect(h.server.getProjectRoom(PROJECT_A).size).toBe(0);
  });

  it("is idempotent on repeated join to the same project: no duplicate membership or events", async () => {
    const h = await harness({ alice: [PROJECT_A], watcher: [PROJECT_A] });
    const alice = await h.connect("alice");
    const watcher = await h.connect("watcher");
    await joinResult(watcher, PROJECT_A);
    const joinedEvents: unknown[] = [];
    record(watcher, "player:joined", joinedEvents);

    expect(await joinResult(alice, PROJECT_A)).toBe("joined");
    expect(await joinResult(alice, PROJECT_A)).toBe("joined");
    expect(await joinResult(alice, PROJECT_A)).toBe("joined");
    await settle();

    expect(joinedEvents).toHaveLength(1);
    expect(h.server.getProjectRoom(PROJECT_A).has(alice.id!)).toBe(true);
  });

  it("keeps malformed/unauthorized join as project:error without mutating membership", async () => {
    const h = await harness({ alice: [PROJECT_A] });
    const alice = await h.connect("alice");
    await joinResult(alice, PROJECT_A);

    expect(await joinResult(alice, PROJECT_B)).toBe("error");
    // malformed payload
    expect(
      await new Promise<"joined" | "error">((resolve) => {
        alice.once("project:joined", () => resolve("joined"));
        alice.once("project:error", () => resolve("error"));
        alice.emit("project:join", { projectId: "   " });
      }),
    ).toBe("error");

    expect(h.server.getProjectRoom(PROJECT_A).has(alice.id!)).toBe(true);
    expect(h.server.getProjectRoom(PROJECT_B).has(alice.id!)).toBe(false);
  });

  it("prevents no socket from receiving project A events after switching to B, and denies a foreign user either room", async () => {
    const h = await harness({
      alice: [PROJECT_A, PROJECT_B],
      mallory: [],
    });
    const alice = await h.connect("alice");
    const mallory = await h.connect("mallory");

    await joinResult(alice, PROJECT_A);
    expect(await joinResult(mallory, PROJECT_A)).toBe("error");
    expect(await joinResult(mallory, PROJECT_B)).toBe("error");
    expect(h.server.getProjectRoom(PROJECT_A).has(mallory.id!)).toBe(false);
    expect(h.server.getProjectRoom(PROJECT_B).has(mallory.id!)).toBe(false);

    const aEvents: unknown[] = [];
    record(alice, "player:joined", aEvents);
    record(alice, "player:left", aEvents);

    await joinResult(alice, PROJECT_B);
    await settle();

    const other = await h.connect("other");
    // other cannot join A (not granted), proving A stays isolated; alice already left A.
    expect(await joinResult(other, PROJECT_A)).toBe("error");
    await settle();

    expect(aEvents.filter((_, i) => i > 0)).toEqual(aEvents.slice(1));
    expect(h.server.getProjectRoom(PROJECT_A).has(alice.id!)).toBe(false);
    expect(h.server.getProjectRoom(PROJECT_B).has(alice.id!)).toBe(true);
  });
});
