import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * BUILD-1. The production server must build into plain JavaScript and start
 * under `node` with no tsx loader, exactly as `npm start` and the image run it.
 */
const ROOT = resolve(__dirname, "../../..");
// Inside the repository, under git-ignored dist/: the bundle keeps npm packages
// external, and Node resolves them from the bundle's own location upwards.
mkdirSync(join(ROOT, "dist"), { recursive: true });
const outdir = mkdtempSync(join(ROOT, "dist", "build1-bundle-"));
const bundle = join(outdir, "index.js");

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? done(address.port)
          : fail(new Error("no port")),
      );
    });
  });
}

describe("BUILD-1 production server bundle", () => {
  let server: ChildProcess | undefined;
  let output = "";
  let port = 0;

  beforeAll(async () => {
    const result = spawnSync(
      process.execPath,
      [join(ROOT, "scripts/build-server-bundle.mjs"), outdir],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);

    port = await freePort();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      STORAGE_PROVIDER: "inmemory",
      DEFAULT_PROVIDER: "none",
      REQUIRE_LLM_PROVIDER: "false",
    };
    delete env.NODE_OPTIONS;
    // Plain node: no --import, no loader. If the bundle still needed tsx,
    // the extensionless imports would fail to resolve here.
    server = spawn(process.execPath, [bundle], { cwd: ROOT, env });
    server.stdout?.on("data", (chunk) => (output += String(chunk)));
    server.stderr?.on("data", (chunk) => (output += String(chunk)));

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.ok) return;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`bundled server did not become healthy:\n${output}`);
  }, 120_000);

  afterAll(() => {
    if (server && server.exitCode === null) server.kill("SIGKILL");
    rmSync(outdir, { recursive: true, force: true });
  });

  it("keeps npm packages external and contains no tsx loader import", () => {
    const source = readFileSync(bundle, "utf8");
    expect(source).not.toMatch(/from ["']tsx(\/[^"']*)?["']/);
    expect(source).toMatch(/from ["']express["']/);
    expect(source).toMatch(/from ["']socket\.io["']/);
    expect(source).toContain('import("pg")');
  });

  it("serves health, the root route and the auth boundary", async () => {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(((await health.json()) as { status: string }).status).toBe(
      "healthy",
    );

    const root = await fetch(`http://127.0.0.1:${port}/`);
    expect(((await root.json()) as { status: string }).status).toBe("running");

    const projects = await fetch(`http://127.0.0.1:${port}/api/projects`);
    expect(projects.status).toBe(401);
  });

  it("accepts a Socket.IO handshake", async () => {
    const response = await fetch(
      `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`,
    );
    expect(response.status).toBe(200);
  });

  it("shuts down on SIGTERM", async () => {
    // Windows cannot deliver a catchable SIGTERM to a child process.
    if (process.platform === "win32") return;
    const exited = new Promise<number | null>((done) =>
      server!.once("exit", (code) => done(code)),
    );
    server!.kill("SIGTERM");
    expect(await exited).toBe(0);
  }, 30_000);
});
