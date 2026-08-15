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
  imageFingerprint: string;
  layoutFingerprint: string;
  outputPath: string;
}

interface StudioCaptureReference {
  captureId: string;
  capture: StudioCaptureResult;
  capturedAt: number;
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

class JsonRpcProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "JsonRpcProtocolError";
  }
}

const SERVER_NAME = "roblox-studio-desktop";
const SERVER_VERSION = "1.0.0";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const MAX_TEXT_LENGTH = 2_000;
const MAX_SCREENSHOT_WIDTH = 1_024;
const MAX_SCREENSHOT_HEIGHT = 768;
const MAX_PROCESS_ID = 2_147_483_647;
const CAPTURE_REFERENCE_TTL_MS = 10 * 60 * 1_000;
const MAX_CAPTURE_REFERENCES = 32;
const HELPER_TIMEOUT_MS = 30_000;
const MAX_FOCUS_LUMINANCE_SHIFT = 40;
const PROJECT_DIRECTORY = resolve(
  process.env.ROBLOX_STUDIO_DESKTOP_PROJECT_DIR ?? process.cwd(),
);
const HELPER_PATH = fileURLToPath(
  new URL("./windows-studio-control.ps1", import.meta.url),
);
const ALLOWED_KEYS = [
  "TAB",
  "SHIFT_TAB",
  "ESCAPE",
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "F5",
  "SHIFT_F5",
  "CTRL_F",
] as const;
const captureReferences = new Map<string, StudioCaptureReference>();
type AllowedKey = (typeof ALLOWED_KEYS)[number];

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
      required: ["pid", "captureId", "x", "y", "button"],
      properties: {
        pid: { type: "integer", minimum: 1, maximum: MAX_PROCESS_ID },
        captureId: { type: "string", format: "uuid" },
        x: { type: "integer", minimum: 0, maximum: MAX_SCREENSHOT_WIDTH - 1 },
        y: { type: "integer", minimum: 0, maximum: MAX_SCREENSHOT_HEIGHT - 1 },
        button: { type: "string", enum: ["left"] },
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
      "Type plain text into the Studio control that was focused by a separately approved studio_click and is visibly focused in the referenced screenshot. This tool never clicks. Requires operator approval. Control characters and text longer than 2000 characters are rejected. Never supply credentials or secrets.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["pid", "captureId", "x", "y", "text"],
      properties: {
        pid: { type: "integer", minimum: 1, maximum: MAX_PROCESS_ID },
        captureId: { type: "string", format: "uuid" },
        x: { type: "integer", minimum: 0, maximum: MAX_SCREENSHOT_WIDTH - 1 },
        y: { type: "integer", minimum: 0, maximum: MAX_SCREENSHOT_HEIGHT - 1 },
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
      "Send one allowlisted navigation or Play-test key to the Studio control that was focused by a separately approved studio_click and is visibly focused in the referenced screenshot. This tool never clicks. SHIFT_F5 is the only focus-target exception. Requires operator approval. No arbitrary shortcuts are accepted.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["pid", "captureId", "x", "y", "key"],
      properties: {
        pid: { type: "integer", minimum: 1, maximum: MAX_PROCESS_ID },
        captureId: { type: "string", format: "uuid" },
        x: { type: "integer", minimum: 0, maximum: MAX_SCREENSHOT_WIDTH - 1 },
        y: { type: "integer", minimum: 0, maximum: MAX_SCREENSHOT_HEIGHT - 1 },
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

function requireCaptureId(object: Record<string, unknown>): string {
  const value = object.captureId;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new Error("captureId must be a UUID from studio_screenshot");
  }
  return value;
}

function validateOptionalTargetArguments(value: unknown): number | undefined {
  const object = assertObject(value ?? {});
  assertOnlyKeys(object, ["pid"]);
  return object.pid === undefined ? undefined : requireProcessId(object);
}

export function validateClickArguments(value: unknown): {
  pid: number;
  captureId: string;
  x: number;
  y: number;
  button: "left";
} {
  const object = assertObject(value);
  assertOnlyKeys(object, ["pid", "captureId", "x", "y", "button"]);
  const pid = requireProcessId(object);
  const captureId = requireCaptureId(object);
  const x = requireInteger(object, "x", 0, MAX_SCREENSHOT_WIDTH - 1);
  const y = requireInteger(object, "y", 0, MAX_SCREENSHOT_HEIGHT - 1);
  if (object.button !== "left") {
    throw new Error("button must be left");
  }
  return {
    pid,
    captureId,
    x,
    y,
    button: object.button,
  };
}

export function validateTextArguments(value: unknown): {
  pid: number;
  captureId: string;
  x: number;
  y: number;
  text: string;
} {
  const object = assertObject(value);
  assertOnlyKeys(object, ["pid", "captureId", "x", "y", "text"]);
  const pid = requireProcessId(object);
  const captureId = requireCaptureId(object);
  const x = requireInteger(object, "x", 0, MAX_SCREENSHOT_WIDTH - 1);
  const y = requireInteger(object, "y", 0, MAX_SCREENSHOT_HEIGHT - 1);
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
  if (text.startsWith("-")) {
    throw new Error("text must not start with a hyphen");
  }
  return { pid, captureId, x, y, text };
}

function isAllowedKey(value: unknown): value is AllowedKey {
  return (
    typeof value === "string" &&
    (ALLOWED_KEYS as readonly string[]).includes(value)
  );
}

export function keyRequiresStableTarget(key: AllowedKey): boolean {
  return key !== "SHIFT_F5";
}

export function validateKeyArguments(value: unknown): {
  pid: number;
  captureId: string;
  x: number;
  y: number;
  key: AllowedKey;
} {
  const object = assertObject(value);
  assertOnlyKeys(object, ["pid", "captureId", "x", "y", "key"]);
  const pid = requireProcessId(object);
  const captureId = requireCaptureId(object);
  const x = requireInteger(object, "x", 0, MAX_SCREENSHOT_WIDTH - 1);
  const y = requireInteger(object, "y", 0, MAX_SCREENSHOT_HEIGHT - 1);
  if (!isAllowedKey(object.key)) {
    throw new Error(`key must be one of: ${ALLOWED_KEYS.join(", ")}`);
  }
  return { pid, captureId, x, y, key: object.key };
}

export function validateEvidenceArguments(value: unknown): {
  pid: number;
  runLabel: string;
  evidenceName: string;
} {
  const object = assertObject(value);
  assertOnlyKeys(object, ["pid", "runLabel", "evidenceName"]);
  return {
    pid: requireProcessId(object),
    runLabel: requireSlug(object, "runLabel"),
    evidenceName: requireSlug(object, "evidenceName"),
  };
}

function registerCaptureReference(capture: StudioCaptureResult): string {
  const now = Date.now();
  for (const [captureId, reference] of captureReferences) {
    if (now - reference.capturedAt > CAPTURE_REFERENCE_TTL_MS)
      captureReferences.delete(captureId);
  }
  while (captureReferences.size >= MAX_CAPTURE_REFERENCES) {
    const oldestCaptureId = captureReferences.keys().next().value as
      string | undefined;
    if (!oldestCaptureId) break;
    captureReferences.delete(oldestCaptureId);
  }
  const captureId = randomUUID();
  captureReferences.set(captureId, {
    captureId,
    capture,
    capturedAt: now,
  });
  return captureId;
}

export function layoutFingerprintsMatch(
  expectedBase64: string,
  currentBase64: string,
): boolean {
  const expected = Buffer.from(expectedBase64, "base64");
  const current = Buffer.from(currentBase64, "base64");
  if (expected.length === 0 || expected.length !== current.length) return false;
  let totalDifference = 0;
  let materiallyChanged = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const difference = Math.abs(expected[index] - current[index]);
    totalDifference += difference;
    if (difference > 24) materiallyChanged += 1;
  }
  return (
    totalDifference / expected.length <= 16 &&
    materiallyChanged / expected.length <= 0.3
  );
}

export function imageTargetFingerprintsMatch(
  expectedBase64: string,
  currentBase64: string,
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number,
): boolean {
  const expected = Buffer.from(expectedBase64, "base64");
  const current = Buffer.from(currentBase64, "base64");
  const fingerprintSize = 64;
  if (
    expected.length !== fingerprintSize * fingerprintSize ||
    current.length !== expected.length ||
    imageWidth < 1 ||
    imageHeight < 1
  ) {
    return false;
  }
  const centerX = Math.min(
    fingerprintSize - 1,
    Math.floor((x * fingerprintSize) / imageWidth),
  );
  const centerY = Math.min(
    fingerprintSize - 1,
    Math.floor((y * fingerprintSize) / imageHeight),
  );
  let compared = 0;
  let totalDifference = 0;
  let maximumDifference = 0;
  for (
    let sampleY = Math.max(0, centerY - 2);
    sampleY <= Math.min(fingerprintSize - 1, centerY + 2);
    sampleY += 1
  ) {
    for (
      let sampleX = Math.max(0, centerX - 2);
      sampleX <= Math.min(fingerprintSize - 1, centerX + 2);
      sampleX += 1
    ) {
      const index = sampleY * fingerprintSize + sampleX;
      const difference = Math.abs(expected[index] - current[index]);
      compared += 1;
      totalDifference += difference;
      maximumDifference = Math.max(maximumDifference, difference);
    }
  }
  return totalDifference / compared <= 8 && maximumDifference <= 40;
}

export function imageTargetFingerprintsMatchWithUniformShift(
  expectedBase64: string,
  currentBase64: string,
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number,
): boolean {
  const expected = Buffer.from(expectedBase64, "base64");
  const current = Buffer.from(currentBase64, "base64");
  const fingerprintSize = 64;
  if (
    expected.length !== fingerprintSize * fingerprintSize ||
    current.length !== expected.length ||
    imageWidth < 1 ||
    imageHeight < 1
  ) {
    return false;
  }
  const centerX = Math.min(
    fingerprintSize - 1,
    Math.floor((x * fingerprintSize) / imageWidth),
  );
  const centerY = Math.min(
    fingerprintSize - 1,
    Math.floor((y * fingerprintSize) / imageHeight),
  );
  const signedDifferences: number[] = [];
  for (
    let sampleY = Math.max(0, centerY - 2);
    sampleY <= Math.min(fingerprintSize - 1, centerY + 2);
    sampleY += 1
  ) {
    for (
      let sampleX = Math.max(0, centerX - 2);
      sampleX <= Math.min(fingerprintSize - 1, centerX + 2);
      sampleX += 1
    ) {
      const index = sampleY * fingerprintSize + sampleX;
      signedDifferences.push(current[index] - expected[index]);
    }
  }
  const meanShift =
    signedDifferences.reduce((sum, difference) => sum + difference, 0) /
    signedDifferences.length;
  const residuals = signedDifferences.map((difference) =>
    Math.abs(difference - meanShift),
  );
  return (
    Math.abs(meanShift) <= MAX_FOCUS_LUMINANCE_SHIFT &&
    residuals.reduce((sum, difference) => sum + difference, 0) /
      residuals.length <=
      8 &&
    Math.max(...residuals) <= 40
  );
}

function equalBounds(
  left: StudioWindowStatus["bounds"],
  right: StudioWindowStatus["bounds"],
): boolean {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function windowStatesMatch(
  reference: StudioWindowStatus,
  current: StudioWindowStatus,
): boolean {
  return (
    current.pid === reference.pid &&
    current.title === reference.title &&
    current.executable === reference.executable &&
    current.minimized === reference.minimized &&
    equalBounds(current.bounds, reference.bounds)
  );
}

function captureMatchesReference(
  reference: StudioCaptureReference,
  current: StudioCaptureResult,
): boolean {
  return (
    current.imageWidth === reference.capture.imageWidth &&
    current.imageHeight === reference.capture.imageHeight &&
    windowStatesMatch(reference.capture, current) &&
    layoutFingerprintsMatch(
      reference.capture.layoutFingerprint,
      current.layoutFingerprint,
    )
  );
}

async function consumeFreshCaptureReference(
  captureId: string,
  pid: number,
): Promise<{
  reference: StudioCaptureReference;
  current: StudioCaptureResult;
  focused: StudioCaptureResult;
}> {
  const reference = captureReferences.get(captureId);
  captureReferences.delete(captureId);
  if (
    !reference ||
    Date.now() - reference.capturedAt > CAPTURE_REFERENCE_TTL_MS ||
    reference.capture.pid !== pid
  ) {
    throw new Error(
      "The screenshot reference is missing, expired, already used, or belongs to another Studio PID; capture a new screenshot before input",
    );
  }
  const unfocused = await invokeHelper<StudioWindowStatus>("Status", [
    "-TargetPid",
    String(pid),
  ]);
  if (!windowStatesMatch(reference.capture, unfocused)) {
    throw new Error(
      "The Roblox Studio window state changed before focus; capture a new screenshot before input",
    );
  }
  const current = await captureToTemporaryFile(pid);
  if (!captureMatchesReference(reference, current.capture)) {
    throw new Error(
      "The Roblox Studio window no longer matches the referenced screenshot; capture a new screenshot before input",
    );
  }
  const focused = await captureToTemporaryFile(pid, true);
  if (!captureMatchesReference(reference, focused.capture)) {
    throw new Error(
      "The Roblox Studio window changed while receiving focus; capture a new screenshot before input",
    );
  }
  return {
    reference,
    current: current.capture,
    focused: focused.capture,
  };
}

function assertTargetAreaUnchanged(
  reference: StudioCaptureReference,
  current: StudioCaptureResult,
  x: number,
  y: number,
): void {
  if (
    !imageTargetFingerprintsMatch(
      reference.capture.imageFingerprint,
      current.imageFingerprint,
      reference.capture.imageWidth,
      reference.capture.imageHeight,
      x,
      y,
    )
  ) {
    throw new Error(
      "The intended input area changed after the referenced screenshot; capture a new screenshot before input",
    );
  }
}

function assertTargetAreaStableAcrossFocus(
  beforeFocus: StudioCaptureResult,
  afterFocus: StudioCaptureResult,
  x: number,
  y: number,
): void {
  if (
    !imageTargetFingerprintsMatchWithUniformShift(
      beforeFocus.imageFingerprint,
      afterFocus.imageFingerprint,
      beforeFocus.imageWidth,
      beforeFocus.imageHeight,
      x,
      y,
    )
  ) {
    throw new Error(
      "The intended input area changed while Studio received focus; capture a new screenshot before input",
    );
  }
}

function expectedBoundsArguments(reference: StudioCaptureReference): string[] {
  const { bounds } = reference.capture;
  return [
    "-ExpectedLeft",
    String(bounds.left),
    "-ExpectedTop",
    String(bounds.top),
    "-ExpectedWidth",
    String(bounds.width),
    "-ExpectedHeight",
    String(bounds.height),
  ];
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
    | "ListWindows"
    | "Status"
    | "Capture"
    | "CaptureFocused"
    | "Click"
    | "TypeText"
    | "PressKey",
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
    const timeout = setTimeout(() => {
      child.kill();
      rejectPromise(
        new Error(
          `Windows Studio helper timed out after ${String(HELPER_TIMEOUT_MS)}ms`,
        ),
      );
    }, HELPER_TIMEOUT_MS);
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timeout);
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

async function captureToTemporaryFile(
  pid?: number,
  focusBeforeCapture = false,
): Promise<{
  capture: StudioCaptureResult;
  data: Buffer;
}> {
  const directory = resolve(tmpdir(), `roblox-studio-mcp-${randomUUID()}`);
  const outputPath = resolve(directory, "studio.png");
  await mkdir(directory, { recursive: true });
  try {
    const capture = await invokeHelper<StudioCaptureResult>(
      focusBeforeCapture ? "CaptureFocused" : "Capture",
      [
        ...(pid === undefined ? [] : ["-TargetPid", String(pid)]),
        "-OutputPath",
        outputPath,
        "-MaxWidth",
        String(MAX_SCREENSHOT_WIDTH),
        "-MaxHeight",
        String(MAX_SCREENSHOT_HEIGHT),
      ],
    );
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

export async function writeEvidenceFile(
  evidencePath: string,
  data: Buffer,
): Promise<void> {
  try {
    await writeFile(evidencePath, data, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(
        "Evidence already exists at the requested path; choose a new runLabel or evidenceName",
      );
    }
    throw error;
  }
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
    const captureId = registerCaptureReference(capture);
    return {
      content: [
        textContent({
          ...capture,
          outputPath: undefined,
          imageFingerprint: undefined,
          layoutFingerprint: undefined,
          captureId,
          coordinateContract:
            "Pass this pid and single-use captureId to the next input tool. For studio_click, use x/y from this exact image. Before studio_type_text or contextual studio_press_key, focus the control with a separately approved studio_click, capture a new screenshot, and use x/y for the visibly focused control from that new image.",
        }),
        { type: "image", data: data.toString("base64"), mimeType: "image/png" },
      ],
    };
  }
  if (name === "studio_click") {
    const click = validateClickArguments(rawArguments);
    const { reference, current, focused } = await consumeFreshCaptureReference(
      click.captureId,
      click.pid,
    );
    if (
      click.x >= reference.capture.imageWidth ||
      click.y >= reference.capture.imageHeight
    ) {
      throw new Error(
        "Click coordinates are outside the referenced screenshot",
      );
    }
    assertTargetAreaUnchanged(reference, current, click.x, click.y);
    assertTargetAreaStableAcrossFocus(current, focused, click.x, click.y);
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
            String(reference.capture.imageWidth),
            "-ScreenshotHeight",
            String(reference.capture.imageHeight),
            "-Button",
            click.button,
            "-ExpectedImageFingerprint",
            focused.imageFingerprint,
            ...expectedBoundsArguments(reference),
          ]),
        ),
      ],
    };
  }
  if (name === "studio_type_text") {
    const input = validateTextArguments(rawArguments);
    const { reference, current, focused } = await consumeFreshCaptureReference(
      input.captureId,
      input.pid,
    );
    if (
      input.x >= reference.capture.imageWidth ||
      input.y >= reference.capture.imageHeight
    ) {
      throw new Error("Text target is outside the referenced screenshot");
    }
    assertTargetAreaUnchanged(reference, current, input.x, input.y);
    assertTargetAreaStableAcrossFocus(current, focused, input.x, input.y);
    return {
      content: [
        textContent(
          await invokeHelper<StudioWindowStatus>("TypeText", [
            "-TargetPid",
            String(input.pid),
            "-Text",
            input.text,
            "-X",
            String(input.x),
            "-Y",
            String(input.y),
            "-ScreenshotWidth",
            String(reference.capture.imageWidth),
            "-ScreenshotHeight",
            String(reference.capture.imageHeight),
            "-ExpectedImageFingerprint",
            focused.imageFingerprint,
            ...expectedBoundsArguments(reference),
          ]),
        ),
      ],
    };
  }
  if (name === "studio_press_key") {
    const input = validateKeyArguments(rawArguments);
    const { reference, current, focused } = await consumeFreshCaptureReference(
      input.captureId,
      input.pid,
    );
    if (
      input.x >= reference.capture.imageWidth ||
      input.y >= reference.capture.imageHeight
    ) {
      throw new Error("Key target is outside the referenced screenshot");
    }
    if (keyRequiresStableTarget(input.key)) {
      assertTargetAreaUnchanged(reference, current, input.x, input.y);
      assertTargetAreaStableAcrossFocus(current, focused, input.x, input.y);
    }
    return {
      content: [
        textContent(
          await invokeHelper<StudioWindowStatus>("PressKey", [
            "-TargetPid",
            String(input.pid),
            "-Key",
            input.key,
            "-X",
            String(input.x),
            "-Y",
            String(input.y),
            "-ScreenshotWidth",
            String(reference.capture.imageWidth),
            "-ScreenshotHeight",
            String(reference.capture.imageHeight),
            "-ExpectedImageFingerprint",
            focused.imageFingerprint,
            ...expectedBoundsArguments(reference),
          ]),
        ),
      ],
    };
  }
  if (name === "studio_capture_evidence") {
    const { pid, runLabel, evidenceName } =
      validateEvidenceArguments(rawArguments);
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
    await writeEvidenceFile(evidencePath, data);
    return {
      content: [
        textContent({
          ...capture,
          imageFingerprint: undefined,
          layoutFingerprint: undefined,
          outputPath: evidencePath,
        }),
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
    try {
      assertObject(request.params ?? {});
    } catch (error) {
      throw new JsonRpcProtocolError(
        -32602,
        error instanceof Error ? error.message : "Invalid initialize params",
      );
    }
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    };
  }
  if (request.method === "ping") return {};
  if (request.method === "tools/list") return { tools: STUDIO_DESKTOP_TOOLS };
  if (request.method === "tools/call") {
    let params: Record<string, unknown>;
    try {
      params = assertObject(request.params);
      if (typeof params.name !== "string")
        throw new Error("tools/call requires a tool name");
    } catch (error) {
      throw new JsonRpcProtocolError(
        -32602,
        error instanceof Error ? error.message : "Invalid tools/call params",
      );
    }
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
  throw new JsonRpcProtocolError(
    -32601,
    `Unsupported MCP method: ${request.method}`,
  );
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
        code: error instanceof JsonRpcProtocolError ? error.code : -32603,
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
        let request: JsonRpcRequest | undefined;
        try {
          let parsed: unknown;
          try {
            parsed = JSON.parse(line) as unknown;
          } catch {
            throw new JsonRpcProtocolError(-32700, "Parse error");
          }
          let object: Record<string, unknown>;
          try {
            object = assertObject(parsed);
          } catch {
            throw new JsonRpcProtocolError(-32600, "Invalid JSON-RPC request");
          }
          if (object.jsonrpc !== "2.0" || typeof object.method !== "string") {
            throw new JsonRpcProtocolError(-32600, "Invalid JSON-RPC request");
          }
          if (
            object.id !== undefined &&
            object.id !== null &&
            typeof object.id !== "string" &&
            typeof object.id !== "number"
          ) {
            throw new JsonRpcProtocolError(
              -32600,
              "Invalid JSON-RPC request id",
            );
          }
          request = object as unknown as JsonRpcRequest;
          const result = await handleRequest(request);
          if (request.id !== undefined && result !== undefined)
            writeResponse(request.id, result);
        } catch (error) {
          if (request && request.id === undefined) return;
          writeError(request?.id ?? null, error);
        }
      });
    }
  });
}

const entryPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === entryPath) void startServer();
