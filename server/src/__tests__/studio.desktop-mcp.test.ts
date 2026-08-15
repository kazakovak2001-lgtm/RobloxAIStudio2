import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  handleRequest,
  imageTargetFingerprintsMatch,
  imageTargetFingerprintsMatchWithUniformShift,
  keyRequiresStableTarget,
  layoutFingerprintsMatch,
  STUDIO_DESKTOP_TOOLS,
  validateClickArguments,
  validateEvidenceArguments,
  validateKeyArguments,
  validateTextArguments,
  windowStatesMatch,
  writeEvidenceFile,
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

    const newerClient = await handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "initialize",
      params: { protocolVersion: "2099-01-01" },
    });
    expect(newerClient).toMatchObject({ protocolVersion: "2025-06-18" });
  });

  it("returns categorized transport errors and preserves valid request IDs", async () => {
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
      const responsePromise = new Promise<Record<string, unknown>[]>(
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
            const lines = stdout.split("\n").filter(Boolean);
            if (lines.length < 5) return;
            clearTimeout(timeout);
            resolveResponse(
              lines
                .slice(0, 5)
                .map((line) => JSON.parse(line) as Record<string, unknown>),
            );
          });
          child.once("error", (error) => {
            clearTimeout(timeout);
            rejectResponse(error);
          });
        },
      );
      child.stdin.end(
        [
          "not-json",
          "null",
          JSON.stringify({
            jsonrpc: "2.0",
            id: "method-error",
            method: "unsupported/method",
          }),
          JSON.stringify({
            jsonrpc: "2.0",
            id: "params-error",
            method: "initialize",
            params: [],
          }),
          JSON.stringify({
            jsonrpc: "2.0",
            method: "unsupported/notification",
          }),
          JSON.stringify({
            jsonrpc: "2.0",
            id: "request-73",
            method: "ping",
          }),
          "",
        ].join("\n"),
      );
      const responses = await responsePromise;
      expect(responses[0]).toMatchObject({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      expect(responses[1]).toMatchObject({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid JSON-RPC request" },
      });
      expect(responses[2]).toMatchObject({
        jsonrpc: "2.0",
        id: "method-error",
        error: {
          code: -32601,
          message: expect.stringContaining("Unsupported MCP method"),
        },
      });
      expect(responses[3]).toMatchObject({
        jsonrpc: "2.0",
        id: "params-error",
        error: { code: -32602, message: "Tool arguments must be an object" },
      });
      expect(responses[4]).toMatchObject({
        jsonrpc: "2.0",
        id: "request-73",
        result: {},
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
    ).toThrow(/button must be left/);
    expect(() =>
      validateClickArguments({
        pid: 1234,
        captureId,
        x: 1,
        y: 1,
        button: "double_left",
      }),
    ).toThrow(/button must be left/);
  });

  it("rejects arbitrary keys and unsafe text", () => {
    expect(keyRequiresStableTarget("F5")).toBe(true);
    expect(keyRequiresStableTarget("SHIFT_F5")).toBe(false);
    expect(
      validateKeyArguments({ pid: 1234, captureId, x: 100, y: 200, key: "F5" }),
    ).toEqual({ pid: 1234, captureId, x: 100, y: 200, key: "F5" });
    expect(() =>
      validateKeyArguments({
        pid: 1234,
        captureId,
        x: 100,
        y: 200,
        key: "ALT_F4",
      }),
    ).toThrow(/key must be one of/);
    expect(
      validateTextArguments({
        pid: 1234,
        captureId,
        x: 100,
        y: 200,
        text: "UI_GENERATION",
      }),
    ).toEqual({ pid: 1234, captureId, x: 100, y: 200, text: "UI_GENERATION" });
    expect(() =>
      validateTextArguments({
        pid: 1234,
        captureId,
        x: 100,
        y: 200,
        text: "line\nbreak",
      }),
    ).toThrow(/control characters/);
    expect(() =>
      validateTextArguments({
        pid: 1234,
        captureId,
        x: 100,
        y: 200,
        text: "-TargetPid",
      }),
    ).toThrow(/must not start with a hyphen/);
    expect(() =>
      validateTextArguments({
        pid: 1234,
        captureId,
        x: 100,
        y: 200,
        text: "ok",
        extra: true,
      }),
    ).toThrow(/Unexpected argument/);
    expect(() =>
      validateKeyArguments({ pid: 0, captureId, x: 100, y: 200, key: "F5" }),
    ).toThrow(/pid must be an integer/);
    expect(() =>
      validateKeyArguments({
        pid: 1234,
        captureId: "stale",
        x: 100,
        y: 200,
        key: "F5",
      }),
    ).toThrow(/captureId must be a UUID/);
    expect(() =>
      validateKeyArguments({ pid: 1234, captureId, key: "F5" }),
    ).toThrow(/x must be an integer/);
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

  it("refuses to overwrite existing Studio evidence", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "studio-evidence-test-"));
    const evidencePath = resolve(directory, "capture.png");
    try {
      await writeEvidenceFile(evidencePath, Buffer.from("first"));
      await expect(
        writeEvidenceFile(evidencePath, Buffer.from("second")),
      ).rejects.toThrow(/Evidence already exists/);
    } finally {
      await rm(directory, { recursive: true, force: true });
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

  it("binds coordinate input to the local target area", () => {
    const expected = Buffer.alloc(64 * 64, 100);
    const outsideChange = Buffer.from(expected);
    outsideChange[0] = 220;
    const targetChange = Buffer.from(expected);
    targetChange[32 * 64 + 32] = 220;

    expect(
      imageTargetFingerprintsMatch(
        expected.toString("base64"),
        outsideChange.toString("base64"),
        1024,
        768,
        512,
        384,
      ),
    ).toBe(true);
    expect(
      imageTargetFingerprintsMatch(
        expected.toString("base64"),
        targetChange.toString("base64"),
        1024,
        768,
        512,
        384,
      ),
    ).toBe(false);

    const uniformFocusShift = Buffer.alloc(64 * 64, 130);
    const excessiveUniformFocusShift = Buffer.alloc(64 * 64, 180);
    const structuralFocusChange = Buffer.from(uniformFocusShift);
    structuralFocusChange[32 * 64 + 32] = 230;
    expect(
      imageTargetFingerprintsMatchWithUniformShift(
        expected.toString("base64"),
        uniformFocusShift.toString("base64"),
        1024,
        768,
        512,
        384,
      ),
    ).toBe(true);
    expect(
      imageTargetFingerprintsMatchWithUniformShift(
        expected.toString("base64"),
        excessiveUniformFocusShift.toString("base64"),
        1024,
        768,
        512,
        384,
      ),
    ).toBe(false);
    expect(
      imageTargetFingerprintsMatchWithUniformShift(
        expected.toString("base64"),
        structuralFocusChange.toString("base64"),
        1024,
        768,
        512,
        384,
      ),
    ).toBe(false);
  });

  it("keeps focus clicks separate from text and key input", async () => {
    const helperPath = resolve(
      process.cwd(),
      "scripts/studio-desktop-mcp/windows-studio-control.ps1",
    );
    const helper = await readFile(helperPath, "utf8");
    const textBlock = helper.slice(
      helper.indexOf("if ($Action -eq 'TypeText')"),
      helper.indexOf("if ($Action -eq 'PressKey')"),
    );
    const keyBlock = helper.slice(
      helper.indexOf("if ($Action -eq 'PressKey')"),
    );

    expect(textBlock).not.toContain("SendLeftClick");
    expect(textBlock).toMatch(
      /Assert-ExpectedTargetFingerprint \$window[\s\S]*SendUnicode\(\$Text\)/u,
    );
    expect(keyBlock).not.toContain("SendLeftClick");
    expect(keyBlock).toMatch(
      /Assert-ExpectedTargetFingerprint \$window[\s\S]*SendWait/u,
    );
  });

  it("invalidates a capture when Studio is minimized before focus", () => {
    const reference = {
      pid: 1234,
      title: "Disposable Baseplate - Roblox Studio",
      executable: "C:\\Roblox\\Versions\\version-test\\RobloxStudioBeta.exe",
      minimized: false,
      foreground: false,
      bounds: { left: 0, top: 0, width: 1280, height: 720 },
    };
    expect(
      windowStatesMatch(reference, { ...reference, foreground: true }),
    ).toBe(true);
    expect(
      windowStatesMatch(reference, { ...reference, minimized: true }),
    ).toBe(false);
    expect(
      windowStatesMatch(reference, {
        ...reference,
        bounds: { ...reference.bounds, width: 1279 },
      }),
    ).toBe(false);
  });
});
