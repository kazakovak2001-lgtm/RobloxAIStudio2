import { describe, expect, it } from "vitest";
import {
  handleRequest,
  STUDIO_DESKTOP_TOOLS,
  validateClickArguments,
  validateKeyArguments,
  validateTextArguments,
} from "../../../scripts/studio-desktop-mcp/server";

describe("Roblox Studio desktop MCP boundary", () => {
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

  it("maps clicks only from valid bounded screenshot coordinates", () => {
    expect(
      validateClickArguments({
        pid: 1234,
        x: 512,
        y: 384,
        screenshotWidth: 1024,
        screenshotHeight: 768,
        button: "left",
      }),
    ).toEqual({
      pid: 1234,
      x: 512,
      y: 384,
      screenshotWidth: 1024,
      screenshotHeight: 768,
      button: "left",
    });
    expect(() =>
      validateClickArguments({
        pid: 1234,
        x: 1024,
        y: 0,
        screenshotWidth: 1024,
        screenshotHeight: 768,
        button: "left",
      }),
    ).toThrow(/x must be an integer/);
    expect(() =>
      validateClickArguments({
        pid: 1234,
        x: 1,
        y: 1,
        screenshotWidth: 1024,
        screenshotHeight: 768,
        button: "right",
      }),
    ).toThrow(/button must be left or double_left/);
  });

  it("rejects arbitrary keys and unsafe text", () => {
    expect(validateKeyArguments({ pid: 1234, key: "F5" })).toEqual({
      pid: 1234,
      key: "F5",
    });
    expect(() => validateKeyArguments({ pid: 1234, key: "ALT_F4" })).toThrow(
      /key must be one of/,
    );
    expect(validateTextArguments({ pid: 1234, text: "UI_GENERATION" })).toEqual(
      { pid: 1234, text: "UI_GENERATION" },
    );
    expect(() =>
      validateTextArguments({ pid: 1234, text: "line\nbreak" }),
    ).toThrow(/control characters/);
    expect(() =>
      validateTextArguments({ pid: 1234, text: "ok", extra: true }),
    ).toThrow(/Unexpected argument/);
    expect(() => validateKeyArguments({ pid: 0, key: "F5" })).toThrow(
      /pid must be an integer/,
    );
  });
});
