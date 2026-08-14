import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  handleRequest,
  layoutFingerprintsMatch,
  STUDIO_DESKTOP_TOOLS,
  validateClickArguments,
  validateEvidenceArguments,
  validateKeyArguments,
  validateTextArguments,
} from "../../../scripts/studio-desktop-mcp/server";

describe("Roblox Studio desktop MCP boundary", () => {
  const captureId = "00000000-0000-4000-8000-000000000000";

  it("exposes the bounded tool surface through MCP", async () => {
    const initialized = await handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    const tools = await handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    expect(initialized).toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "roblox-studio-desktop", version: "1.0.0" },
    });
    expect(tools).toEqual({ tools: STUDIO_DESKTOP_TOOLS });
    expect(STUDIO_DESKTOP_TOOLS.map((tool) => tool.name)).toEqual([
      "studio_list_windows",
      "studio_window_status",
      "studio_screenshot",
      "studio_click",
      "studio_type_text",
      "studio_press_key",
      "studio_capture_evidence",
    ]);
  });

  it("preserves a valid request ID in transport-level errors", async () => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(process.cwd(), "scripts/studio-desktop-mcp/server.ts"),
      ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    try {
      const responsePromise = new Promise<Record<string, unknown>>(
        (resolveResponse, rejectResponse) => {
          let stdout = "";
          let stderr = "";
          const timeout = setTimeout(() => {
            rejectResponse(
              new Error(`MCP error response timed out: ${stderr.trim()}`),
            );
          }, 15_000);
          child.stderr.on("data", (chunk: string) => {
            stderr += chunk;
          });
          child.stdout.on("data", (chunk: string) => {
            stdout += chunk;
            const newline = stdout.indexOf("\n");
            if (newline < 0) return;
            clearTimeout(timeout);
            resolveResponse(
              JSON.parse(stdout.slice(0, newline)) as Record<string, unknown>,
            );
          });
          child.once("error", (error) => {
            clearTimeout(timeout);
            rejectResponse(error);
          });
        },
      );
      child.stdin.end(
        `${JSON.stringify({ jsonrpc: "2.0", id: "request-73", method: "unsupported" })}\n`,
      );
      const response = await responsePromise;
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: "request-73",
        error: { code: -32603, message: "Unsupported MCP method: unsupported" },
      });
    } finally {
      child.kill();
    }
  }, 20_000);

  it("maps clicks only from valid bounded screenshot coordinates", () => {
    expect(
      validateClickArguments({
        pid: 1234,
        captureId,
        x: 512,
        y: 384,
        button: "left",
      }),
    ).toEqual({
      pid: 1234,
      captureId,
      x: 512,
      y: 384,
      button: "left",
    });
    expect(() =>
      validateClickArguments({
        pid: 1234,
        captureId,
        x: 1024,
        y: 0,
        button: "left",
      }),
    ).toThrow(/x must be an integer/);
    expect(() =>
      validateClickArguments({
        pid: 1234,
        captureId,
        x: 1,
        y: 1,
        button: "right",
      }),
    ).toThrow(/button must be left or double_left/);
  });

  it("rejects arbitrary keys and unsafe text", () => {
    expect(validateKeyArguments({ pid: 1234, captureId, key: "F5" })).toEqual({
      pid: 1234,
      captureId,
      key: "F5",
    });
    expect(() =>
      validateKeyArguments({ pid: 1234, captureId, key: "ALT_F4" }),
    ).toThrow(/key must be one of/);
    expect(
      validateTextArguments({ pid: 1234, captureId, text: "UI_GENERATION" }),
    ).toEqual({ pid: 1234, captureId, text: "UI_GENERATION" });
    expect(() =>
      validateTextArguments({ pid: 1234, captureId, text: "line\nbreak" }),
    ).toThrow(/control characters/);
    expect(() =>
      validateTextArguments({ pid: 1234, captureId, text: "-TargetPid" }),
    ).toThrow(/must not start with a hyphen/);
    expect(() =>
      validateTextArguments({ pid: 1234, captureId, text: "ok", extra: true }),
    ).toThrow(/Unexpected argument/);
    expect(() =>
      validateKeyArguments({ pid: 0, captureId, key: "F5" }),
    ).toThrow(/pid must be an integer/);
    expect(() =>
      validateKeyArguments({ pid: 1234, captureId: "stale", key: "F5" }),
    ).toThrow(/captureId must be a UUID/);
  });

  it("confines evidence labels to lowercase path-safe slugs", () => {
    expect(
      validateEvidenceArguments({
        pid: 1234,
        runLabel: "bridge-smoke",
        evidenceName: "initial-state",
      }),
    ).toEqual({
      pid: 1234,
      runLabel: "bridge-smoke",
      evidenceName: "initial-state",
    });
    for (const unsafe of ["../escape", "Upper", ""]) {
      expect(() =>
        validateEvidenceArguments({
          pid: 1234,
          runLabel: unsafe,
          evidenceName: "safe-name",
        }),
      ).toThrow(/lowercase slug/);
      expect(() =>
        validateEvidenceArguments({
          pid: 1234,
          runLabel: "safe-run",
          evidenceName: unsafe,
        }),
      ).toThrow(/lowercase slug/);
    }
  });

  it("tolerates small chrome changes but rejects a changed layout", () => {
    const expected = Buffer.alloc(328, 100);
    const smallChange = Buffer.from(expected);
    smallChange[0] = 110;
    const changedLayout = Buffer.alloc(328, 180);

    expect(
      layoutFingerprintsMatch(
        expected.toString("base64"),
        smallChange.toString("base64"),
      ),
    ).toBe(true);
    expect(
      layoutFingerprintsMatch(
        expected.toString("base64"),
        changedLayout.toString("base64"),
      ),
    ).toBe(false);
  });
});
