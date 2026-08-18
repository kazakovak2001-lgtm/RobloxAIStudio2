import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

const indexSource = fs.readFileSync(
  path.join(process.cwd(), "server/src/index.ts"),
  "utf8",
);

function startBlock(): string {
  const start = indexSource.indexOf("const startServer = (port: number)");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = indexSource.indexOf("process.exit(1)", start);
  return indexSource.slice(start, end < 0 ? indexSource.length : end);
}

async function ipv6LoopbackAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(0, "::1", () => probe.close(() => resolve(true)));
  });
}

async function get(origin: string, port: number): Promise<number> {
  const response = await fetch(`http://${origin}:${port}/`);
  return response.status;
}

describe("backend listener reaches Studio over both loopback stacks", () => {
  // Regression: the entry point bound IPv4-only ("0.0.0.0"). Windows resolves
  // "localhost" to ::1 first, so the documented plugin default
  // http://localhost:5000 failed with a transport-level ConnectFail while the
  // server was listening. The Studio plugin reached the backend only after the
  // listener became dual-stack.
  it("does not bind the listener to IPv4 only", () => {
    const block = startBlock();
    expect(block).not.toContain('httpServer.listen(port, "0.0.0.0"');
    expect(block).toContain("httpServer.listen(port, HOST");
  });

  it("defaults to the dual-stack wildcard and honours HOST", () => {
    expect(indexSource).toContain('let HOST = process.env.HOST || "::";');
  });

  it("falls back to IPv4 when the host has no IPv6 stack", () => {
    const block = startBlock();
    expect(block).toContain('HOST === "::"');
    expect(block).toContain("EAFNOSUPPORT");
    expect(block).toContain("EADDRNOTAVAIL");
    expect(block).toContain('HOST = "0.0.0.0"');
  });

  it("serves IPv6 and IPv4 loopback clients from one dual-stack listener", async () => {
    if (!(await ipv6LoopbackAvailable())) return;

    const server = http.createServer((_request, response) => {
      response.writeHead(200);
      response.end("ok");
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "::", resolve);
    });
    const { port } = server.address() as AddressInfo;

    try {
      expect(await get("[::1]", port)).toBe(200);
      expect(await get("127.0.0.1", port)).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("leaves an IPv4-only listener unreachable over IPv6 loopback", async () => {
    if (!(await ipv6LoopbackAvailable())) return;

    const server = http.createServer((_request, response) => {
      response.writeHead(200);
      response.end("ok");
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "0.0.0.0", resolve);
    });
    const { port } = server.address() as AddressInfo;

    try {
      await expect(get("[::1]", port)).rejects.toThrow();
      expect(await get("127.0.0.1", port)).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
