/**
 * LLM-LOG-1 / LLM-LOG-DATA-001 — logs must not carry prompts or generated code.
 *
 * The Ollama provider logged the full request body and the full raw response on
 * every call, so the user's brief, the internal prompts and the generated Luau
 * went into backend logs on the happy path. Those logs have whatever retention
 * and access the sink has, not whatever the project has.
 *
 * The rule is enforced by shape rather than by discipline: the telemetry helper
 * takes measurements, not payloads, so logging a completion means going around
 * it deliberately. Payload previews exist for local debugging, are bounded, and
 * are unavailable in production whatever the flag says.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  logProviderCall,
  payloadLoggingEnabled,
  previewForDebug,
} from "../providers/providerTelemetry";

const originalEnv = process.env.NODE_ENV;
const originalFlag = process.env.LLM_DEBUG_PAYLOADS;

beforeEach(() => {
  delete process.env.LLM_DEBUG_PAYLOADS;
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  if (originalFlag === undefined) delete process.env.LLM_DEBUG_PAYLOADS;
  else process.env.LLM_DEBUG_PAYLOADS = originalFlag;
});

describe("LLM-LOG-1 provider telemetry", () => {
  it("reports measurements and nothing that could hold content", () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (message: string) => lines.push(String(message));

    try {
      logProviderCall({
        provider: "ollama",
        model: "qwen2.5-coder:7b",
        status: 200,
        durationMs: 1234,
        responseChars: 8192,
        tokensUsed: 2048,
        finishReason: "complete",
      });
    } finally {
      console.log = original;
    }

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("provider=ollama");
    expect(lines[0]).toContain("responseChars=8192");
    expect(lines[0]).toContain("tokens=2048");
    // The size of a completion is a measurement; the completion is not.
    expect(lines[0]).not.toContain("local ");
  });
});

describe("LLM-LOG-1 payload previews", () => {
  it("redacts by default", () => {
    expect(previewForDebug("local x = 1")).toBe("[redacted 11 chars]");
  });

  it("stays redacted in production even with the flag set", () => {
    process.env.NODE_ENV = "production";
    process.env.LLM_DEBUG_PAYLOADS = "true";

    // The point is that production logs cannot carry this, not that they are
    // configured not to. An operator setting the flag on a production host
    // still gets nothing.
    expect(payloadLoggingEnabled()).toBe(false);
    expect(previewForDebug("secret brief")).toBe("[redacted 12 chars]");
  });

  it("allows a bounded preview outside production when asked", () => {
    process.env.LLM_DEBUG_PAYLOADS = "true";

    expect(payloadLoggingEnabled()).toBe(true);
    expect(previewForDebug("short")).toBe("short");
  });

  it("escapes newlines so a prompt cannot forge extra log lines", () => {
    process.env.LLM_DEBUG_PAYLOADS = "true";

    const preview = previewForDebug(
      "line one\nFAKE ERROR: injected\r\nline three",
    );

    expect(preview).not.toContain("\n");
    expect(preview).not.toContain("\r");
    expect(preview).toBe("line one\\nFAKE ERROR: injected\\r\\nline three");
  });

  it("bounds the preview even when enabled", () => {
    process.env.LLM_DEBUG_PAYLOADS = "true";
    const long = "x".repeat(5000);

    const preview = previewForDebug(long, 100);

    // A debugging aid does not need the whole completion, and an unbounded
    // preview is the same exposure with a longer name.
    expect(preview.length).toBeLessThan(200);
    expect(preview.endsWith("…[truncated]")).toBe(true);
  });

  it("needs the flag, not merely a non-production environment", () => {
    expect(payloadLoggingEnabled()).toBe(false);
  });
});

describe("LLM-LOG-1 provider source", () => {
  it("no longer logs the request body or the raw response", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../providers/ollama.ts", import.meta.url),
      "utf8",
    );

    // A source assertion, deliberately: these two lines are what the finding
    // was, and their absence is the thing to keep true. The behavioural rule
    // above is what stops an equivalent line being written elsewhere.
    expect(source).not.toContain("Body: ${JSON.stringify(requestBody)}");
    expect(source).not.toContain("Raw response body:");
  });
});
