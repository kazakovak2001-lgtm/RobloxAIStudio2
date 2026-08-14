import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

type JsonRpcId = number | string | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface StudioWindowStatus {
  pid: number;
  title: string;
  executable: string;
  minimized: boolean;
  foreground: boolean;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

interface StudioCaptureResult extends StudioWindowStatus {
  imageWidth: number;
  imageHeight: number;
  outputPath: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

const SERVER_NAME = "roblox-studio-desktop";
const SERVER_VERSION = "1.0.0";
const MAX_TEXT_LENGTH = 2_000;
const MAX_SCREENSHOT_WIDTH = 1_024;
const MAX_SCREENSHOT_HEIGHT = 768;
const MAX_PROCESS_ID = 2_147_483_647;
const PROJECT_DIRECTORY = resolve(
  process.env.ROBLOX_STUDIO_DESKTOP_PROJECT_DIR ?? process.cwd(),
);
const HELPER_PATH = fileURLToPath(
  new URL("./windows-studio-control.ps1", import.meta.url),
);
const ALLOWED_KEYS = [
  "TAB",
  "SHIFT_TAB",
  "ENTER",
  "ESCAPE",
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "F5",
  "SHIFT_F5",
  "CTRL_F",
] as const;

export const STUDIO_DESKTOP_TOOLS: ToolDefinition[] = [
  {
    name: "studio_list_windows",
    description:
      "List every eligible Roblox Studio main window with its PID, title, executable, and bounds. Use this before selecting a target when more than one Studio process exists.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "studio_window_status",
    description:
      "Report one eligible Roblox Studio window. Supply a PID from studio_list_windows to pin the target; otherwise ambiguous windows are refused.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pid: { type: "integer", minimum: 1, maximum: MAX_PROCESS_ID },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "studio_screenshot",
    description:
      "Capture only an eligible Roblox Studio window by its verified native handle. Supply a PID from studio_list_windows when multiple windows exist. Returns a scaled PNG and dimensions for subsequent clicks.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pid: { type: "integer", minimum: 1, maximum: MAX_PROCESS_ID },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "studio_click",
    description:
      "Focus Roblox Studio and click a point relative to a prior screenshot. Requires operator approval. Never use for Publish, Save to Roblox, upload, account, login, purchase, or credential dialogs.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "pid",
        "x",
        "y",
        "screenshotWidth",
        "screenshotHeight",
        "button",
      ],
      properties: {
        pid: { type: "integer", minimum: 1, maximum: MAX_PROCESS_ID },
        x: { type: "integer", minimum: 0 },
        y: { type: "integer", minimum: 0 },
        screenshotWidth: {
          type: "integer",
          minimum: 1,
          maximum: MAX_SCREENSHOT_WIDTH,
        },
        screenshotHeight: {
          type: "integer",
          minimum: 1,
          maximum: MAX_SCREENSHOT_HEIGHT,
        },
        button: { type: "string", enum: ["left", "double_left"] },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "studio_type_text",
    description:
      "Type plain text into the focused control inside Roblox Studio. Requires operator approval. Control characters and text longer than 2000 characters are rejected. Never supply credentials or secrets.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["pid", "text"],
      properties: {
        pid: { type: "integer", minimum: 1, maximum: MAX_PROCESS_ID },
        text: { type: "string", minLength: 1, maxLength: MAX_TEXT_LENGTH },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "studio_press_key",
    description:
      "Send one allowlisted navigation or Play-test key to Roblox Studio. Requires operator approval. No arbitrary shortcuts are accepted.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["pid", "key"],
      properties: {
        pid: { type: "integer", minimum: 1, maximum: MAX_PROCESS_ID },
        key: { type: "string", enum: ALLOWED_KEYS },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "studio_capture_evidence",
    description:
      "Capture the Roblox Studio window into ignored local operator evidence under artifacts/studio-acceptance/operator. Requires approval because the screenshot is persisted locally.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["pid", "runLabel", "evidenceName"],
      properties: {
        pid: { type: "integer", minimum: 1, maximum: MAX_PROCESS_ID },
        runLabel: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" },
        evidenceName: {
          type: "string",
          pattern: "^[a-z0-9][a-z0-9-]{0,63}$",
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

function assertObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object");
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  object: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const unexpected = Object.keys(object).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unexpected.length > 0) {
    throw new Error(`Unexpected argument(s): ${unexpected.join(", ")}`);
  }
}

function requireInteger(
  object: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): number {
  const value = object[key];
  if (
    !Number.isInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}`);
  }
  return Number(value);
}

function requireSlug(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error(`${key} must be a lowercase slug of at most 64 characters`);
  }
  return value;
}

function requireProcessId(object: Record<string, unknown>): number {
  return requireInteger(object, "pid", 1, MAX_PROCESS_ID);
}

function validateOptionalTargetArguments(value: unknown): number | undefined {
  const object = assertObject(value ?? {});
  assertOnlyKeys(object, ["pid"]);
  return object.pid === undefined ? undefined : requireProcessId(object);
}

export function validateClickArguments(value: unknown): {
  pid: number;
  x: number;
  y: number;
  screenshotWidth: number;
  screenshotHeight: number;
  button: "left" | "double_left";
} {
  const object = assertObject(value);
  assertOnlyKeys(object, [
    "pid",
    "x",
    "y",
    "screenshotWidth",
    "screenshotHeight",
    "button",
  ]);
  const pid = requireProcessId(object);
  const screenshotWidth = requireInteger(
    object,
    "screenshotWidth",
    1,
    MAX_SCREENSHOT_WIDTH,
  );
  const screenshotHeight = requireInteger(
    object,
    "screenshotHeight",
    1,
    MAX_SCREENSHOT_HEIGHT,
  );
  const x = requireInteger(object, "x", 0, screenshotWidth - 1);
  const y = requireInteger(object, "y", 0, screenshotHeight - 1);
  if (object.button !== "left" && object.button !== "double_left") {
    throw new Error("button must be left or double_left");
  }
  return {
    pid,
    x,
    y,
    screenshotWidth,
    screenshotHeight,
    button: object.button,
  };
}

export function validateTextArguments(value: unknown): {
  pid: number;
  text: string;
} {
  const object = assertObject(value);
  assertOnlyKeys(object, ["pid", "text"]);
  const pid = requireProcessId(object);
  const text = object.text;
  if (
    typeof text !== "string" ||
    text.length < 1 ||
    text.length > MAX_TEXT_LENGTH
  ) {
    throw new Error(`text must contain 1 to ${MAX_TEXT_LENGTH} characters`);
  }
  if (/\p{Cc}/u.test(text)) {
    throw new Error("text must not contain control characters");
  }
  return { pid, text };
}

export function validateKeyArguments(value: unknown): {
  pid: number;
  key: (typeof ALLOWED_KEYS)[number];
} {
  const object = assertObject(value);
  assertOnlyKeys(object, ["pid", "key"]);
  const pid = requireProcessId(object);
  if (
    typeof object.key !== "string" ||
    !ALLOWED_KEYS.includes(object.key as (typeof ALLOWED_KEYS)[number])
  ) {
    throw new Error(`key must be one of: ${ALLOWED_KEYS.join(", ")}`);
  }
  return { pid, key: object.key as (typeof ALLOWED_KEYS)[number] };
}

function parseHelperOutput<T>(output: string): T {
  const line = output
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .findLast((entry) => entry.startsWith("{") || entry.startsWith("["));
  if (!line) throw new Error("Windows Studio helper returned no JSON result");
  return JSON.parse(line) as T;
}

async function invokeHelper<T>(
  action:
    "ListWindows" | "Status" | "Capture" | "Click" | "TypeText" | "PressKey",
  argumentsList: string[] = [],
): Promise<T> {
  if (process.platform !== "win32") {
    throw new Error(
      "Roblox Studio desktop control is available only on Windows",
    );
  }
  const output = await new Promise<string>((resolvePromise, rejectPromise) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        HELPER_PATH,
        "-Action",
        action,
        ...argumentsList,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectPromise);
    child.once("close", (exitCode) => {
      if (exitCode === 0) resolvePromise(stdout);
      else
        rejectPromise(
          new Error(
            stderr.trim() ||
              stdout.trim() ||
              `Helper exited ${String(exitCode)}`,
          ),
        );
    });
  });
  return parseHelperOutput<T>(output);
}

async function captureToTemporaryFile(pid?: number): Promise<{
  capture: StudioCaptureResult;
  data: Buffer;
}> {
  const directory = resolve(tmpdir(), `roblox-studio-mcp-${randomUUID()}`);
  const outputPath = resolve(directory, "studio.png");
  await mkdir(directory, { recursive: true });
  try {
    const capture = await invokeHelper<StudioCaptureResult>("Capture", [
      ...(pid === undefined ? [] : ["-TargetPid", String(pid)]),
      "-OutputPath",
      outputPath,
      "-MaxWidth",
      String(MAX_SCREENSHOT_WIDTH),
      "-MaxHeight",
      String(MAX_SCREENSHOT_HEIGHT),
    ]);
    return { capture, data: await readFile(outputPath) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function textContent(value: unknown): { type: "text"; text: string } {
  return {
    type: "text",
    text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
  };
}

async function callTool(
  name: string,
  rawArguments: unknown,
): Promise<Record<string, unknown>> {
  if (name === "studio_list_windows") {
    const object = assertObject(rawArguments ?? {});
    assertOnlyKeys(object, []);
    return {
      content: [
        textContent(await invokeHelper<StudioWindowStatus[]>("ListWindows")),
      ],
    };
  }
  if (name === "studio_window_status") {
    const pid = validateOptionalTargetArguments(rawArguments);
    return {
      content: [
        textContent(
          await invokeHelper<StudioWindowStatus>(
            "Status",
            pid === undefined ? [] : ["-TargetPid", String(pid)],
          ),
        ),
      ],
    };
  }
  if (name === "studio_screenshot") {
    const pid = validateOptionalTargetArguments(rawArguments);
    const { capture, data } = await captureToTemporaryFile(pid);
    return {
      content: [
        textContent({
          ...capture,
          outputPath: undefined,
          coordinateContract:
            "Pass this pid plus x/y and imageWidth/imageHeight to studio_click.",
        }),
        { type: "image", data: data.toString("base64"), mimeType: "image/png" },
      ],
    };
  }
  if (name === "studio_click") {
    const click = validateClickArguments(rawArguments);
    return {
      content: [
        textContent(
          await invokeHelper<StudioWindowStatus>("Click", [
            "-TargetPid",
            String(click.pid),
            "-X",
            String(click.x),
            "-Y",
            String(click.y),
            "-ScreenshotWidth",
            String(click.screenshotWidth),
            "-ScreenshotHeight",
            String(click.screenshotHeight),
            "-Button",
            click.button,
          ]),
        ),
      ],
    };
  }
  if (name === "studio_type_text") {
    const input = validateTextArguments(rawArguments);
    return {
      content: [
        textContent(
          await invokeHelper<StudioWindowStatus>("TypeText", [
            "-TargetPid",
            String(input.pid),
            "-Text",
            input.text,
          ]),
        ),
      ],
    };
  }
  if (name === "studio_press_key") {
    const input = validateKeyArguments(rawArguments);
    return {
      content: [
        textContent(
          await invokeHelper<StudioWindowStatus>("PressKey", [
            "-TargetPid",
            String(input.pid),
            "-Key",
            input.key,
          ]),
        ),
      ],
    };
  }
  if (name === "studio_capture_evidence") {
    const object = assertObject(rawArguments);
    assertOnlyKeys(object, ["pid", "runLabel", "evidenceName"]);
    const pid = requireProcessId(object);
    const runLabel = requireSlug(object, "runLabel");
    const evidenceName = requireSlug(object, "evidenceName");
    const { capture, data } = await captureToTemporaryFile(pid);
    const evidenceDirectory = resolve(
      PROJECT_DIRECTORY,
      "artifacts",
      "studio-acceptance",
      "operator",
      runLabel,
    );
    const evidencePath = resolve(evidenceDirectory, `${evidenceName}.png`);
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(evidencePath, data);
    return {
      content: [
        textContent({ ...capture, outputPath: evidencePath }),
        { type: "image", data: data.toString("base64"), mimeType: "image/png" },
      ],
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

export async function handleRequest(
  request: JsonRpcRequest,
): Promise<Record<string, unknown> | undefined> {
  if (request.method === "initialize") {
    const params = assertObject(request.params ?? {});
    return {
      protocolVersion:
        typeof params.protocolVersion === "string"
          ? params.protocolVersion
          : "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    };
  }
  if (request.method === "ping") return {};
  if (request.method === "tools/list") return { tools: STUDIO_DESKTOP_TOOLS };
  if (request.method === "tools/call") {
    const params = assertObject(request.params);
    if (typeof params.name !== "string")
      throw new Error("tools/call requires a tool name");
    try {
      return await callTool(params.name, params.arguments ?? {});
    } catch (error) {
      return {
        isError: true,
        content: [
          textContent(error instanceof Error ? error.message : String(error)),
        ],
      };
    }
  }
  if (request.method.startsWith("notifications/")) return undefined;
  throw new Error(`Unsupported MCP method: ${request.method}`);
}

function writeResponse(id: JsonRpcId, result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function writeError(id: JsonRpcId, error: unknown): void {
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    })}\n`,
  );
}

async function startServer(): Promise<void> {
  process.stdin.setEncoding("utf8");
  let buffer = "";
  let queue = Promise.resolve();
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      queue = queue.then(async () => {
        let request: JsonRpcRequest;
        try {
          request = JSON.parse(line) as JsonRpcRequest;
          const result = await handleRequest(request);
          if (request.id !== undefined && result !== undefined)
            writeResponse(request.id, result);
        } catch (error) {
          writeError(null, error);
        }
      });
    }
  });
}

const entryPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === entryPath) void startServer();
